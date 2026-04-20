const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// === OTP CONFIGURATION ===
// A temporary store for OTPs (in production, use Redis or a database)
const otpStore = {};

// Setup Nodemailer Transporter has been removed.
// We are using Secure Terminal logging for the OTP to bypass strict Gmail App Password requirements.

// Endpoint to generate and send OTP
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Generate a 4-digit code
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Store OTP with an expiration timestamp (e.g., 5 mins)
    otpStore[email] = {
        otp: otp,
        expiresAt: Date.now() + 5 * 60 * 1000
    };

    // Console Logging Mode (Bypasses Gmail App Passwords)
    console.log("\n=========================================");
    console.log(`🔔 [SECURE AUTH] NEW LOGIN ATTEMPT`);
    console.log(`📩 Target Email : ${email}`);
    console.log(`🔑 YOUR OTP IS  : ${otp}`);
    console.log("=========================================\n");

    res.status(200).json({ success: true, message: "OTP securely generated. Please check the backend terminal." });
});

// Endpoint to verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const storedData = otpStore[email];

    if (!storedData) {
        return res.status(400).json({ error: "No OTP found for this email. Please request a new one." });
    }

    if (Date.now() > storedData.expiresAt) {
        delete otpStore[email]; // Clear expired OTP
        return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    if (storedData.otp === otp) {
        // Success
        delete otpStore[email]; // Invalidate after successful use
        res.status(200).json({ success: true, message: "OTP verified correctly" });
    } else {
        res.status(400).json({ error: "Invalid OTP entered." });
    }
});
// ==========================

// Path to our CSV database file (CSV opens flawlessly in both VS Code AND Excel!)
const csvFilePath = path.join(__dirname, 'Contacts.csv');

// Helper function to save contacts to CSV format
function saveToCSV(newContact) {
    // Check if the file already exists
    const fileExists = fs.existsSync(csvFilePath);

    // Escape quotes and commas in user input to prevent CSV formatting issues
    const safeName = `"${(newContact.name || '').replace(/"/g, '""')}"`;
    const safePhone = `"${(newContact.phone || '').replace(/"/g, '""')}"`;
    const safeMessage = `"${(newContact.message || '').replace(/"/g, '""')}"`;
    const date = `"${new Date().toLocaleString()}"`;

    // Create the row text
    const csvRow = `${safeName},${safePhone},${safeMessage},${date}\n`;

    // If it's a brand new file, we add the Header row first!
    if (!fileExists) {
        const headerRow = '"Full Name","Phone Number","Message","Submission Date"\n';
        fs.writeFileSync(csvFilePath, headerRow + csvRow, 'utf8');
    } else {
        // Just append the new row to the end of the existing file
        fs.appendFileSync(csvFilePath, csvRow, 'utf8');
    }
}

// POST route to handle form submission
app.post('/contact', (req, res) => {
    try {
        const { name, phone, message } = req.body;

        const newContact = { name, phone, message };

        // Save directly to the CSV file
        saveToCSV(newContact);

        console.log("New contact saved to CSV:", newContact);
        
        // Respond to the client
        res.send(`
            <h2>Thank You!</h2>
            <p>Your details have been saved successfully.</p>
            <a href="http://127.0.0.1:5500/contact.html">Go Back</a>
        `);
    } catch (error) {
        console.error("Error saving contact:", error);
        res.status(500).send("An error occurred while saving your details. Please try again later.");
    }
});

// GET route to view all contacts in the browser (Just like we had before!)
app.get('/contacts', (req, res) => {
    try {
        if (fs.existsSync(csvFilePath)) {
            const data = fs.readFileSync(csvFilePath, 'utf8');
            res.type('text/plain').send(data);
        } else {
            res.send("No contacts saved yet.");
        }
    } catch (error) {
        res.status(500).send("Error reading from database.");
    }
});

// GET /api/contacts endpoint for the Admin Dashboard
app.get('/api/contacts', (req, res) => {
    try {
        if (!fs.existsSync(csvFilePath)) {
            return res.json([]);
        }
        const data = fs.readFileSync(csvFilePath, 'utf8');
        const lines = data.trim().split('\n');
        
        const contacts = [];
        // Skip header at index 0
        for (let i = 1; i < lines.length; i++) {
            // Regex to match CSV fields wrapped in quotes
            const matches = lines[i].match(/(?<=^|,)"(.*?)"(?=,|$)/g);
            if (matches && matches.length >= 4) {
                contacts.push({
                    clientName: matches[0].slice(1, -1).replace(/""/g, '"'),
                    contactInfo: matches[1].slice(1, -1).replace(/""/g, '"'),
                    message: matches[2].slice(1, -1).replace(/""/g, '"'),
                    date: matches[3].slice(1, -1).replace(/""/g, '"')
                });
            }
        }
        // Send newest first
        res.json(contacts.reverse());
    } catch (error) {
        console.error("Error reading API data:", error);
        res.status(500).json({ error: "Error reading database." });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Saving form submissions to: ${csvFilePath}`);
});
