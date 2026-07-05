require('dotenv').config({
  path: __dirname + '/.env'
});
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const productsFile = path.join(__dirname, "products.json");
const customersFile = path.join(__dirname, "customers.json");
const ordersFile = path.join(__dirname, "orders.json");
const usersFile = path.join(__dirname, "users.json");
const pendingUsersFile = path.join(__dirname, 'pendingUsers.json');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });


const app = express();

app.use(express.static(__dirname));

// Increase payload size limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static files - FIXED: Changed 'public' to 'frontend'
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/photo', express.static(path.join(__dirname, '../frontend/photo')));
app.use('/invoices', express.static(path.join(__dirname, '../frontend/invoices')));


// ===============================
// CallMeBot WhatsApp Configuration
// ===============================

async function sendWhatsAppMessage(message) {
    try {

        const url =
            `https://api.callmebot.com/whatsapp.php?phone=${process.env.CALLMEBOT_PHONE}&text=${encodeURIComponent(message)}&apikey=${process.env.CALLMEBOT_APIKEY}`;

        await axios.get(url);

        console.log("✅ WhatsApp message sent successfully");
        return true;

    } catch (err) {

        console.error("❌ WhatsApp Error:", err.message);
        return false;

    }
}
// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'soul-art-secret-key-change-this-in-production';

// ================= EMAIL TRANSPORTER (BREVO) =================
// ===============================
// BREVO EMAIL API (NO SMTP)
// ===============================

const axios = require("axios");

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (!BREVO_API_KEY) {
    console.log("❌ BREVO_API_KEY not found in .env");
} else {
    console.log("✅ Brevo API Ready");
}
// ========== Send WhatsApp using CallMeBot ==========
async function sendWhatsAppFromBusiness(toNumber, message, imageUrl = null) {

    try {

        let finalMessage = message;

        // Add image link if available
        if (imageUrl) {
            finalMessage += "\n\n📷 Image:\n" + imageUrl;
        }

        const url =
            `https://api.callmebot.com/whatsapp.php?phone=${process.env.CALLMEBOT_PHONE}&text=${encodeURIComponent(finalMessage)}&apikey=${process.env.CALLMEBOT_APIKEY}`;

        await axios.get(url);

        console.log("✅ WhatsApp sent successfully");

        return {
            success: true,
            hasImage: imageUrl ? true : false
        };

    } catch (error) {

        console.error("❌ WhatsApp Error:", error.message);

        return {
            success: false,
            error: error.message
        };

    }

}

// ========== Send Email Function (Generic) ==========
async function sendEmail(to, subject, html, text = '') {

    try {

        const response = await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender: {
                    name: process.env.EMAIL_FROM_NAME,
                    email: process.env.EMAIL_FROM
                },
                to: [
                    {
                        email: to
                    }
                ],
                subject: subject,
                htmlContent: html,
                textContent: text
            },
            {
                headers: {
                    "accept": "application/json",
                    "api-key": process.env.BREVO_API_KEY,
                    "content-type": "application/json"
                }
            }
        );

        console.log("✅ Email sent:", response.data);

        return true;

    } catch (error) {

        console.error(
            "❌ Brevo API Error:",
            error.response?.data || error.message
        );

        return false;

    }

}

// ========== Step 1 - Send OTP for Registration ==========
app.post('/api/signup/send-otp', async (req, res) => {
  try {
    const { email, password, name, phone, whatsappNumber } = req.body;

    console.log('📝 Signup OTP request for:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!emailLower.includes('@') || !emailLower.includes('.')) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    let users = [];

    if (fs.existsSync(usersFile)) {
    users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const existingUser = users.find(
        u => u.email.toLowerCase() === emailLower
    );
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered. Please sign in.' });
    }

    let pendingUsers = [];
    if (fs.existsSync(pendingUsersFile)) {
      pendingUsers = JSON.parse(fs.readFileSync(pendingUsersFile, "utf8"));
    }

    const existingPending = pendingUsers.find(
      u => u.email === emailLower
    );

    if (existingPending) {
      const updatedPending = pendingUsers.filter(
        u => u.email !== emailLower
      );
      fs.writeFileSync(
        pendingUsersFile,
        JSON.stringify(updatedPending, null, 2)
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    console.log(`📱 OTP generated for registration: ${emailLower}`);

    pendingUsers.push({
      email: emailLower,
      password: await bcrypt.hash(password, 12),
      name: name || '',
      phone: phone || '',
      whatsappNumber: whatsappNumber || '',
      otp,
      expires
    });

    fs.writeFileSync(
      pendingUsersFile,
      JSON.stringify(pendingUsers, null, 2)
    );
    // Professional OTP Email Template
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email - Soul Art Studio</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
              }
              .container {
                  border: 1px solid #e0e0e0;
                  border-radius: 8px;
                  overflow: hidden;
              }
              .header {
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 30px 20px;
                  text-align: center;
              }
              .header h1 {
                  margin: 0;
                  font-size: 24px;
                  font-weight: 600;
              }
              .content {
                  padding: 30px;
                  background: #ffffff;
              }
              .otp-container {
                  background: #f8f9fa;
                  border-radius: 8px;
                  padding: 25px;
                  margin: 30px 0;
                  text-align: center;
                  border: 2px dashed #667eea;
              }
              .otp-code {
                  font-size: 42px;
                  font-weight: 700;
                  color: #333;
                  letter-spacing: 8px;
                  font-family: monospace;
                  margin: 20px 0;
                  background: white;
                  padding: 15px;
                  border-radius: 6px;
                  display: inline-block;
                  border: 1px solid #e0e0e0;
              }
              .warning {
                  color: #d32f2f;
                  font-size: 14px;
                  margin-top: 10px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
              }
              .warning svg {
                  width: 16px;
                  height: 16px;
              }
              .steps {
                  background: #f3f4f6;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 25px 0;
              }
              .step {
                  display: flex;
                  align-items: flex-start;
                  margin-bottom: 15px;
              }
              .step-number {
                  background: #667eea;
                  color: white;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: bold;
                  margin-right: 12px;
                  flex-shrink: 0;
              }
              .footer {
                  border-top: 1px solid #e0e0e0;
                  padding: 20px;
                  text-align: center;
                  color: #666;
                  font-size: 12px;
                  background: #fafafa;
              }
              .logo {
                  font-size: 28px;
                  font-weight: bold;
                  color: #333;
                  margin-bottom: 10px;
              }
              .logo span {
                  color: #667eea;
              }
              .button {
                  display: inline-block;
                  background: #667eea;
                  color: white;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: 600;
                  margin-top: 20px;
              }
              .info-box {
                  background: #e8f4ff;
                  border-left: 4px solid #667eea;
                  padding: 15px;
                  margin: 20px 0;
                  border-radius: 4px;
              }
              @media (max-width: 600px) {
                  .content {
                      padding: 20px;
                  }
                  .otp-code {
                      font-size: 32px;
                      letter-spacing: 6px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Verify Your Email Address</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">Complete your registration with Soul Art Studio</p>
              </div>
              
              <div class="content">
                  <div class="logo">Soul<span>Art</span>Studio</div>
                  
                  <p>Hello${name ? ' <strong>' + name + '</strong>' : ''},</p>
                  
                  <p>Thank you for choosing Soul Art Studio! To complete your registration and secure your account, please verify your email address using the OTP below:</p>
                  
                  <div class="otp-container">
                      <p style="margin: 0 0 15px 0; color: #666;">Your One-Time Password (OTP)</p>
                      <div class="otp-code">${otp}</div>
                      <div class="warning">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                          </svg>
                          <span>This OTP will expire in 10 minutes</span>
                      </div>
                  </div>
                  
                  <div class="steps">
                      <div class="step">
                          <div class="step-number">1</div>
                          <div>Enter the 6-digit code above on the verification page</div>
                      </div>
                      <div class="step">
                          <div class="step-number">2</div>
                          <div>Click "Verify Email" to complete your registration</div>
                      </div>
                      <div class="step">
                          <div class="step-number">3</div>
                          <div>Start exploring our collection of custom artwork</div>
                      </div>
                  </div>
                  
                  <div class="info-box">
                      <strong>📱 Need help?</strong>
                      <p style="margin: 8px 0 0 0; font-size: 14px;">
                          Contact our support team:<br>
                          WhatsApp: +91 82899 67605<br>
                          Email: support@soulartstudio.com
                      </p>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 25px;">
                      If you didn't request this registration, please ignore this email. Your email address will not be added to our mailing list.
                  </p>
              </div>
              
              <div class="footer">
                  <p style="margin: 0;">© ${new Date().getFullYear()} Soul Art Studio. All rights reserved.</p>
                  <p style="margin: 8px 0 0 0; color: #999;">This is an automated message, please do not reply to this email.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    const emailText = `
      TURBO WHEELS - EMAIL VERIFICATION
      =====================================
      
      Hello${name ? ' ' + name : ''},
      
      Thank you for choosing Soul Art Studio! To complete your registration and secure your account, please verify your email address using the OTP below:
      
      Your One-Time Password (OTP): ${otp}
      
      ⚠️ This OTP will expire in 10 minutes
      
      Steps to complete registration:
      1. Enter the 6-digit code above on the verification page
      2. Click "Verify Email" to complete your registration
      3. Start exploring our collection of custom artwork
      
      Need help?
      Contact our support team:
      WhatsApp: +91 82899 67605
      Email: support@soulartstudio.com
      
      If you didn't request this registration, please ignore this email. Your email address will not be added to our mailing list.
      
      © ${new Date().getFullYear()} Soul Art Studio. All rights reserved.
      This is an automated message, please do not reply to this email.
    `;

    const emailSent = await sendEmail(
      emailLower,
      'Verify Your Email - Complete Your Soul Art Studio Registration',
      emailHtml,
      emailText
    );

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email',
      email: emailLower,
      expiresIn: '10 minutes'
    });

  } catch (error) {
    console.error('❌ Signup OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ========== Step 2 - Verify OTP and Complete Registration ==========
app.post('/api/signup/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('🔐 Registration OTP verification for:', email);

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const emailLower = email.toLowerCase().trim();

    let pendingUsers = [];
    if (fs.existsSync(pendingUsersFile)) {
      pendingUsers = JSON.parse(fs.readFileSync(pendingUsersFile, "utf8"));
    }

    const pendingUser = pendingUsers.find(
      u => u.email === emailLower
    );

    if (!pendingUser) {
      return res.status(400).json({
        error: "OTP expired or not found. Please request a new OTP."
      });
    }

    if (new Date() > pendingUser.expires) {
      return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
    }

    if (pendingUser.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const existingUser = users.find(
      u => u.email === emailLower
    );

    if (existingUser) {
      return res.status(400).json({
        error: "Email already registered. Please sign in."
      });
    }
    
    const user = {
      email: emailLower,
      password: pendingUser.password,
      name: pendingUser.name,
      phone: pendingUser.phone,
      whatsappNumber: pendingUser.whatsappNumber,
      cart: [],
      orders: [],
      isVerified: true
    };

    users.push(user);

    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );
    
    const updatedPendingUsers = pendingUsers.filter(
      u => u.email !== emailLower
    );

    fs.writeFileSync(
      pendingUsersFile,
      JSON.stringify(updatedPendingUsers, null, 2)
    );
    
    const token = jwt.sign({
      email: user.email,
      isVerified: true
    }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ User registered and verified:', emailLower);

    await sendEmail(
      emailLower,
      'Welcome to Soul Art Studio!',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e90ff; text-align: center;">Welcome to Soul Art Studio! 🎨</h2>
          <p>Hello ${user.name || 'there'},</p>
          <p>Your account has been successfully verified and created!</p>
          
          <div style="background: #e8f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Get Started:</h3>
            <p>• Browse our collection of custom artwork</p>
            <p>• Add items to your cart</p>
            <p>• Place orders and get WhatsApp updates</p>
          </div>
          
          <p>If you have any questions, contact us at:</p>
            <p>📱 WhatsApp: +91 82899 67605</p>
          <p>📧 Email: support@soulartstudio.com</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="http://localhost:5000/frames.html" 
               style="background: #1e90ff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Start Shopping 🛍️
            </a>
          </div>
        </div>
      `,
      `Welcome to Soul Art Studio! Your account has been successfully created.`
    );

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        isVerified: true
      },
      message: 'Registration successful! Welcome to Soul Art Studio.'
    });

  } catch (error) {
    console.error('❌ Registration verification error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ========== Resend Registration OTP ==========
app.post('/api/signup/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailLower = email.toLowerCase().trim();

    let pendingUsers = [];
    if (fs.existsSync(pendingUsersFile)) {
      pendingUsers = JSON.parse(fs.readFileSync(pendingUsersFile, "utf8"));
    }

    const pendingUser = pendingUsers.find(
      u => u.email === emailLower
    );

    if (!pendingUser) {
      return res.status(400).json({
        error: "No pending registration found. Please start over."
      });
    }
    
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    pendingUser.otp = newOtp;
    pendingUser.expires = expires;
    fs.writeFileSync(
      pendingUsersFile,
      JSON.stringify(pendingUsers, null, 2)
    );

    console.log(`📱 New OTP generated for: ${emailLower}`);

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New OTP - Soul Art Studio</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
              }
              .container {
                  border: 1px solid #e0e0e0;
                  border-radius: 8px;
                  overflow: hidden;
              }
              .header {
                  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                  color: white;
                  padding: 25px 20px;
                  text-align: center;
              }
              .header h1 {
                  margin: 0;
                  font-size: 22px;
                  font-weight: 600;
              }
              .content {
                  padding: 25px;
                  background: #ffffff;
              }
              .otp-container {
                  background: #f0f9ff;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 25px 0;
                  text-align: center;
                  border: 2px dashed #4facfe;
              }
              .otp-code {
                  font-size: 36px;
                  font-weight: 700;
                  color: #333;
                  letter-spacing: 6px;
                  font-family: monospace;
                  margin: 15px 0;
                  background: white;
                  padding: 12px;
                  border-radius: 6px;
                  display: inline-block;
                  border: 1px solid #e0e0e0;
              }
              .info-box {
                  background: #f3f4f6;
                  border-radius: 8px;
                  padding: 15px;
                  margin: 20px 0;
                  font-size: 14px;
              }
              .footer {
                  border-top: 1px solid #e0e0e0;
                  padding: 15px;
                  text-align: center;
                  color: #666;
                  font-size: 12px;
                  background: #fafafa;
              }
              .logo {
                  font-size: 24px;
                  font-weight: bold;
                  color: #333;
                  margin-bottom: 10px;
              }
              .logo span {
                  color: #4facfe;
              }
              @media (max-width: 600px) {
                  .content {
                      padding: 20px;
                  }
                  .otp-code {
                      font-size: 28px;
                      letter-spacing: 4px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>New Verification Code</h1>
                  <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Your previous OTP has been replaced</p>
              </div>
              
              <div class="content">
                  <div class="logo">Soul<span>Art</span>Studio</div>
                  
                  <p>Hello${pendingUser.name ? ' <strong>' + pendingUser.name + '</strong>' : ''},</p>
                  
                  <p>As requested, here is your new verification code for Soul Art Studio registration:</p>
                  
                  <div class="otp-container">
                      <div class="otp-code">${newOtp}</div>
                      <p style="margin: 10px 0 0 0; color: #f5576c; font-size: 14px;">
                          ⚠️ Expires in 10 minutes
                      </p>
                  </div>
                  
                  <div class="info-box">
                      <strong>ℹ️ Important:</strong>
                      <p style="margin: 8px 0 0 0;">
                          This new code replaces your previous OTP. 
                          Please use this code immediately as your previous code is no longer valid.
                      </p>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 20px;">
                      Enter this code on the registration page to complete your signup.
                  </p>
              </div>
              
              <div class="footer">
                  <p style="margin: 0;">© ${new Date().getFullYear()} Soul Art Studio</p>
                  <p style="margin: 5px 0 0 0; color: #999; font-size: 11px;">Automated message - Do not reply</p>
              </div>
          </div>
      </body>
      </html>
    `;

    const emailText = `
      NEW OTP - TURBO WHEELS
      =========================
      
      Hello${pendingUser.name ? ' ' + pendingUser.name : ''},
      
      As requested, here is your new verification code for Soul Art Studio registration:
      
      New OTP: ${newOtp}
      
      ⚠️ Expires in 10 minutes
      
      ℹ️ Important:
      This new code replaces your previous OTP. 
      Please use this code immediately as your previous code is no longer valid.
      
      Enter this code on the registration page to complete your signup.
      
      © ${new Date().getFullYear()} Soul Art Studio
      Automated message - Do not reply
    `;

    const emailSent = await sendEmail(
      emailLower,
      'New Verification Code - Soul Art Studio',
      emailHtml,
      emailText
    );

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to resend OTP' });
    }

    res.json({
      success: true,
      message: 'New OTP sent to your email',
      expiresIn: '10 minutes'
    });

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// ========== User Login ==========
app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const user = users.find(
      u => u.email === email.toLowerCase().trim()
    );
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ 
      email: user.email,
      isVerified: user.isVerified 
    }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ Login successful for:', user.email, 'Verified:', user.isVerified);

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ========== Forgot Password OTP Email ==========
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Forgot password request for:', email);

    const emailLower = email.toLowerCase().trim();

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const user = users.find(
      u => u.email === emailLower
    );

    if (!user) {
      return res.status(400).json({
        error: "User not found"
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    let otps = [];
    const otpFile = path.join(__dirname, "otp.json");
    if (fs.existsSync(otpFile)) {
      otps = JSON.parse(fs.readFileSync(otpFile, "utf8"));
    }

    otps = otps.filter(o => o.email !== emailLower);

    otps.push({
      email: emailLower,
      otp: otp,
      expires: new Date(Date.now() + 10*60*1000)
    });

    fs.writeFileSync(
      otpFile,
      JSON.stringify(otps, null, 2)
    );

    console.log('📱 OTP saved for', email);

 if (!process.env.BREVO_API_KEY) {
  console.error("❌ BREVO_API_KEY not configured");
  return res.status(500).json({
    error: "Email service not configured"
  });
}

    try {
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password - Soul Art Studio</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .container {
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    padding: 30px 20px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }
                .content {
                    padding: 30px;
                    background: #ffffff;
                }
                .otp-container {
                    background: #fff5f5;
                    border-radius: 8px;
                    padding: 25px;
                    margin: 30px 0;
                    text-align: center;
                    border: 2px dashed #f5576c;
                }
                .otp-code {
                    font-size: 42px;
                    font-weight: 700;
                    color: #d32f2f;
                    letter-spacing: 8px;
                    font-family: monospace;
                    margin: 20px 0;
                    background: white;
                    padding: 15px;
                    border-radius: 6px;
                    display: inline-block;
                    border: 1px solid #ffcdd2;
                }
                .warning {
                    color: #d32f2f;
                    font-size: 14px;
                    margin-top: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                .security-note {
                    background: #fff3e0;
                    border-left: 4px solid #ff9800;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .steps {
                    background: #f3f4f6;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 25px 0;
                }
                .step {
                    display: flex;
                    align-items: flex-start;
                    margin-bottom: 15px;
                }
                .step-number {
                  background: #f5576c;
                  color: white;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: bold;
                  margin-right: 12px;
                  flex-shrink: 0;
                }
                .footer {
                    border-top: 1px solid #e0e0e0;
                    padding: 20px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    background: #fafafa;
                }
                .logo {
                    font-size: 28px;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 10px;
                }
                .logo span {
                    color: #f5576c;
                }
                .button {
                    display: inline-block;
                    background: #f5576c;
                    color: white;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    margin-top: 20px;
                }
                @media (max-width: 600px) {
                    .content {
                        padding: 20px;
                    }
                    .otp-code {
                        font-size: 32px;
                        letter-spacing: 6px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Reset Your Password</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Secure your Soul Art Studio account</p>
                </div>
                
                <div class="content">
                    <div class="logo">Soul<span>Art</span>Studio</div>
                    
                    <p>Hello <strong>${user.name || 'there'}</strong>,</p>
                    
                    <p>We received a request to reset the password for your Soul Art Studio account. To proceed with resetting your password, please use the OTP below:</p>
                    
                    <div class="otp-container">
                        <p style="margin: 0 0 15px 0; color: #666;">Your Password Reset OTP</p>
                        <div class="otp-code">${otp}</div>
                        <div class="warning">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                            </svg>
                            <span>This OTP will expire in 10 minutes</span>
                        </div>
                    </div>
                    
                    <div class="security-note">
                        <strong>🔒 Security Notice:</strong>
                        <p style="margin: 8px 0 0 0;">
                            If you didn't request a password reset, please ignore this email. 
                            Your account security is important to us.
                        </p>
                    </div>
                    
                    <div class="steps">
                        <div class="step">
                            <div class="step-number">1</div>
                            <div>Enter the 6-digit OTP on the password reset page</div>
                        </div>
                        <div class="step">
                            <div class="step-number">2</div>
                            <div>Create a new strong password for your account</div>
                        </div>
                        <div class="step">
                            <div class="step-number">3</div>
                            <div>Sign in with your new password to access your account</div>
                        </div>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 25px;">
                        For security reasons, this OTP is valid for a single use and will expire in 10 minutes.
                        Do not share this OTP with anyone.
                    </p>
                </div>
                
                <div class="footer">
                    <p style="margin: 0;">© ${new Date().getFullYear()} Soul Art Studio. All rights reserved.</p>
                    <p style="margin: 8px 0 0 0; color: #999;">This is an automated security message, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
      `;

      const emailSent = await sendEmail(
    email,
    "Reset Your Password - TURBO WHEELS",
    emailHtml,
    `
TURBO WHEELS - PASSWORD RESET
=================================

Hello ${user.name || "there"},

Your Password Reset OTP: ${otp}

This OTP will expire in 10 minutes.

If you didn't request a password reset, ignore this email.
`
);

if (!emailSent) {
    return res.status(500).json({
        error: "Failed to send email"
    });
}

console.log("✅ Password reset OTP email sent successfully");
      res.json({ 
        success: true, 
        message: 'OTP sent to your email successfully' 
      });
      
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
      res.status(500).json({ error: 'Failed to send email' });
    }

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Verify OTP (for password reset)
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('🔐 OTP verification for:', email);

    const emailLower = email.toLowerCase().trim();
    const otpFile = path.join(__dirname, "otp.json");
    let otps = [];

    if (fs.existsSync(otpFile)) {
      otps = JSON.parse(fs.readFileSync(otpFile, "utf8"));
    }

    const otpRecord = otps.find(
      o => o.email === emailLower
    );

    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP not found or expired' });
    }

    if (new Date() > new Date(otpRecord.expires)) {
      otps = otps.filter(
        o => o.email !== emailLower
      );
      fs.writeFileSync(
        otpFile,
        JSON.stringify(otps, null, 2)
      );
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    console.log('✅ OTP verified for:', email);

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ========== PRODUCT ROUTES ==========

// Get all products
app.get('/api/products', (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// Get single product by ID
app.get('/api/products/:id', (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    const productId = req.params.id;
    const product = products.find(p => p.id.toString() === productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Add new product (with image upload)
app.post('/api/products', upload.single('image'), (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    const newProduct = {
      id: Date.now().toString(),
      name: req.body.name,
      price: Number(req.body.price),
      stock: Number(req.body.stock) || 0,
      description: req.body.description || '',
      image: req.file ? '/uploads/' + req.file.filename : ''
    };

    products.push(newProduct);
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    res.json({ 
      success: true, 
      message: 'Product added successfully',
      product: newProduct
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add product' 
    });
  }
});

// Legacy add product endpoint
app.post('/api/products/add', upload.single('image'), (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    const newProduct = {
      id: Date.now().toString(),
      name: req.body.name,
      price: Number(req.body.price),
      stock: Number(req.body.stock) || 0,
      description: req.body.description || '',
      image: req.file ? '/uploads/' + req.file.filename : ''
    };

    products.push(newProduct);
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    res.json({ 
      success: true, 
      message: 'Product added successfully',
      product: newProduct
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add product' 
    });
  }
});

// Update product
app.put('/api/products/:id', upload.single('image'), (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    const productId = req.params.id;
    const index = products.findIndex(p => p.id.toString() === productId);

    if (index === -1) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    // Update product fields
    products[index].name = req.body.name || products[index].name;
    products[index].price = Number(req.body.price) || products[index].price;
    products[index].stock = Number(req.body.stock) !== undefined ? Number(req.body.stock) : products[index].stock;
    products[index].description = req.body.description !== undefined ? req.body.description : products[index].description;
    
    // Update image if new file uploaded
    if (req.file) {
      products[index].image = '/uploads/' + req.file.filename;
    }

    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    res.json({ 
      success: true, 
      message: 'Product updated successfully',
      product: products[index]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update product' 
    });
  }
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    const productId = req.params.id;
    const initialLength = products.length;
    products = products.filter(p => p.id.toString() !== productId);

    if (products.length === initialLength) {
      return res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }

    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete product' 
    });
  }
});

// Legacy admin add product
app.post('/api/admin/add-product', upload.single('image'), (req, res) => {
  try {
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    }

    const newProduct = {
      id: Date.now().toString(),
      name: req.body.name,
      price: Number(req.body.price) || 0,
      stock: Number(req.body.stock) || 0,
      description: req.body.description || '',
      image: req.file ? '/uploads/' + req.file.filename : ''
    };

    products.push(newProduct);
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

    res.json({
      success: true,
      message: 'Product added successfully',
      product: newProduct
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Failed to add product'
    });
  }
});

// ========== Reset Password ==========
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    console.log('🔄 Password reset for:', email);

    const emailLower = email.toLowerCase().trim();
    const otpFile = path.join(__dirname, "otp.json");
    let otps = [];

    if (fs.existsSync(otpFile)) {
      otps = JSON.parse(fs.readFileSync(otpFile, "utf8"));
    }

    const otpRecord = otps.find(
      o => o.email === emailLower
    );
    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP not found or expired' });
    }

    if (new Date() > new Date(otpRecord.expires)) {
      otps = otps.filter(
        o => o.email !== emailLower
      );
      fs.writeFileSync(
        otpFile,
        JSON.stringify(otps, null, 2)
      );
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(u => u.email === emailLower);
    if (userIndex === -1) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    users[userIndex].password = hashedPassword;
    
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );

    // Remove OTP after use
    otps = otps.filter(o => o.email !== emailLower);
    fs.writeFileSync(
      otpFile,
      JSON.stringify(otps, null, 2)
    );

    console.log('✅ Password reset successful for:', email);

    res.json({ success: true, message: 'Password reset successfully' });

  } catch (error) {
    console.error('❌ Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ========== CART ROUTES ==========

// Get User Cart
app.get('/api/cart', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const user = users.find(
      u => u.email === decoded.email
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, cart: user.cart || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add to Cart
app.post('/api/cart/add', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(
      u => u.email === decoded.email
    );

    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[userIndex];
    
    // Initialize cart if it doesn't exist
    if (!user.cart) {
      user.cart = [];
    }

    const { item } = req.body;
    const existingItemIndex = user.cart.findIndex(
      cartItem => cartItem.id === item.id
    );

    if (existingItemIndex !== -1) {
      user.cart[existingItemIndex].qty = (user.cart[existingItemIndex].qty || 1) + (item.qty || 1);
    } else {
      user.cart.push({
        ...item,
        id: item.id || `ITEM_${Date.now()}`,
        qty: item.qty || 1,
        timestamp: new Date()
      });
    }

    users[userIndex] = user;
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );
    
    res.json({ success: true, cart: user.cart });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// Remove from Cart
app.delete('/api/cart/remove/:itemId', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(
      u => u.email === decoded.email
    );

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[userIndex];
    if (!user.cart) {
      user.cart = [];
    }

    const { itemId } = req.params;
    user.cart = user.cart.filter(item => item.id !== itemId);

    users[userIndex] = user;
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );

    res.json({ success: true, cart: user.cart });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// ========== ORDER ROUTES ==========

// Create Order
app.post('/api/orders/create', async (req, res) => {
  try {
    console.log('\n📦 ========== ORDER CREATION STARTED ==========');
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(
      u => u.email === decoded.email
    );

    if (userIndex === -1) {
      return res.status(400).json({
        success: false,
        error: "User not found"
      });
    }

    const user = users[userIndex];
    
    const { items, subtotal, deliveryCharge, total, fulfill, paymentMethod, address, notes, whatsappNumber } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items in order'
      });
    }

    if (!total || Number(total) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order total'
      });
    }

    const finalWhatsappNumber = whatsappNumber || user.whatsappNumber;
    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    console.log('👤 Customer:', user.email, 'Verified:', user.isVerified);
    console.log('📱 WhatsApp:', finalWhatsappNumber || 'Not provided');
    console.log('💰 Total: ₹', total);

    let itemsArray = items;
    if (typeof itemsArray === 'string') {
      try {
        itemsArray = JSON.parse(itemsArray);
      } catch (parseError) {
        console.error('❌ Failed to parse items:', parseError.message);
        itemsArray = [{
          id: 'ITEM_ERROR',
          name: 'Item',
          type: 'general',
          price: total || 0,
          qty: 1
        }];
      }
    }
    
    if (!Array.isArray(itemsArray)) {
      itemsArray = [itemsArray];
    }

    console.log('✅ Items count:', itemsArray.length);

    const orderItems = itemsArray.map((item, index) => {
      const itemObj = typeof item === 'string' ? { name: item } : item;
      
      return {
        id: itemObj.id || `ITEM_${index}_${Date.now()}`,
        name: itemObj.name || 'Product',
        type: itemObj.type || 'general',
        size: itemObj.size || '',
        color: itemObj.color || '',
        frameColor: itemObj.frameColor || '',
        frameWidth: itemObj.frameWidth || 0,
        price: parseFloat(itemObj.price) || parseFloat(itemObj.priceEach) || 0,
        priceEach: parseFloat(itemObj.priceEach) || parseFloat(itemObj.price) || 0,
        qty: parseInt(itemObj.qty) || 1,
        image: itemObj.image || ''
      };
    });

    // Update stock
    let products = [];
    if (fs.existsSync(productsFile)) {
      products = JSON.parse(fs.readFileSync(productsFile, "utf8"));
    }

    for (const item of orderItems) {
      const productIndex = products.findIndex(
        p => p.id.toString() === item.id.toString()
      );

      if (productIndex !== -1) {
        if (products[productIndex].stock < item.qty) {
          return res.status(400).json({
            success: false,
            error: `Not enough stock for ${item.name}`
          });
        }
        products[productIndex].stock -= item.qty;
      }
    }

    fs.writeFileSync(
      productsFile,
      JSON.stringify(products, null, 2)
    );

    const orderData = {
      orderId,
      userEmail: user.email,
      whatsappNumber: finalWhatsappNumber,
      items: orderItems,
      subtotal: parseFloat(subtotal) || 0,
      deliveryCharge: parseFloat(deliveryCharge) || 0,
      total: parseFloat(total) || 0,
      fulfill: fulfill || 'pickup',
      paymentMethod: paymentMethod || 'upi',
      address: address || null,
      notes: notes || '',
      status: 'Placed',
      hiddenFromAdmin: false,
      whatsappSent: false,
      whatsappHasImage: false,
      emailSent: false,
      createdAt: new Date()
    };

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    orders.push(orderData);

    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );

    console.log('💾 Order saved to orders.json');

    // Initialize user orders if it doesn't exist
    if (!user.orders) {
      user.orders = [];
    }

    user.orders.push({
      orderId,
      items: orderItems,
      total: orderData.total,
      status: 'Placed',
      deliveryDate: null,
      progressNotes: '',
      createdAt: new Date()
    });

    user.cart = [];

    users[userIndex] = user;
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );

    console.log('👤 User updated in users.json');

    const emailSent = await sendEmail(
      user.email,
      `🎨 Order Confirmation #${orderId} - Soul Art Studio`,
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e90ff;">Order Confirmation</h2>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Total:</strong> ₹${total}</p>
          <p><strong>Status:</strong> Placed</p>
          <p>Thank you for your order! We'll process it soon.</p>
        </div>
      `,
      `Order #${orderId} confirmed. Total: ₹${total}. Status: Placed.`
    );

    if (emailSent) {
      let orders = [];
      if (fs.existsSync(ordersFile)) {
        orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
      }

      const i = orders.findIndex(o => o.orderId === orderId);
      if (i !== -1) {
        orders[i].emailSent = true;
      }

      fs.writeFileSync(
        ordersFile,
        JSON.stringify(orders, null, 2)
      );
      console.log('✅ Email status updated');
    }

    console.log('✅ ========== ORDER CREATION COMPLETED ==========\n');
    
    res.json({ 
      success: true, 
      order: {
        orderId,
        total: orderData.total,
        status: 'Placed',
        emailSent,
        whatsappSent: whatsappResult.success,
        whatsappHasImage: whatsappResult.hasImage
      },
      message: 'Order placed successfully! Check your email and WhatsApp.'
    });

  } catch (error) {
    console.error('❌ Order creation error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create order: ' + error.message
    });
  }
});

// Get User Orders (from order collection)
app.get('/api/orders/my-orders', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const user = users.find(
      u => u.email === decoded.email
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    const userOrders = orders
      .filter(order => order.userEmail === user.email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      orders: userOrders
    });
  } catch (error) {
    console.error('❌ Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get User Orders (legacy - from user's orders array)
app.get('/api/orders', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const user = users.find(
      u => u.email === decoded.email
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    if (user.orders && user.orders.length > 0) {
      const enhancedOrders = user.orders.map((userOrder) => {
        const latestOrder = orders.find(
          o => o.orderId === userOrder.orderId
        );
        if (latestOrder) {
          return {
            ...userOrder,
            deliveryDate: latestOrder.deliveryDate || userOrder.deliveryDate,
            progressNotes: latestOrder.progressNotes || userOrder.progressNotes,
            status: latestOrder.status || userOrder.status
          };
        }
        return userOrder;
      });
      
      res.json({ success: true, orders: enhancedOrders });
    } else {
      const userOrders = orders
        .filter(order => order.userEmail === user.email)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      res.json({ success: true, orders: userOrders });
    }
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ========== ADMIN ROUTES ==========

// Require Admin Middleware
const requireAdmin = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Change this email to YOUR admin email
    if (decoded.email !== "turbowheelhub@gmail.com") {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    next();

  } catch (err) {
    return res.status(401).json({
      error: "Invalid token"
    });
  }
};

// Get All Orders (Admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }
    const filteredOrders = orders.filter(order => !order.hiddenFromAdmin).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, orders: filteredOrders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update Order Status (Admin)
app.put('/api/admin/orders/:orderId/status', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, deliveryDate, progressNotes } = req.body;

    console.log(`🔄 Updating order ${orderId} status to: ${status}`, { deliveryDate, progressNotes });

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    const orderIndex = orders.findIndex(
      o => o.orderId === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    orders[orderIndex].status = status;
    
    if (deliveryDate) {
      orders[orderIndex].deliveryDate = new Date(deliveryDate);
      console.log(`✅ Set delivery date: ${orders[orderIndex].deliveryDate}`);
    } else if (status === 'Delivered' && !orders[orderIndex].deliveryDate) {
      orders[orderIndex].deliveryDate = new Date();
      console.log(`✅ Auto-set delivery date to now: ${orders[orderIndex].deliveryDate}`);
    }
    
    if (progressNotes !== undefined) {
      orders[orderIndex].progressNotes = progressNotes;
    }

    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );

    // Update user's orders array
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(u => u.email === orders[orderIndex].userEmail);
    if (userIndex !== -1 && users[userIndex].orders) {
      const userOrderIndex = users[userIndex].orders.findIndex(
        o => o.orderId === orderId
      );
      if (userOrderIndex !== -1) {
        users[userIndex].orders[userOrderIndex].status = status;
        users[userIndex].orders[userOrderIndex].deliveryDate = orders[orderIndex].deliveryDate;
        users[userIndex].orders[userOrderIndex].progressNotes = progressNotes || '';
        
        fs.writeFileSync(
          usersFile,
          JSON.stringify(users, null, 2)
        );
      }
    }
    
    console.log(`✅ Order ${orderId} updated: ${status}, Delivery: ${orders[orderIndex].deliveryDate}`);
    
    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`,
      order: {
        orderId: orders[orderIndex].orderId,
        status: orders[orderIndex].status,
        deliveryDate: orders[orderIndex].deliveryDate,
        progressNotes: orders[orderIndex].progressNotes
      }
    });

  } catch (error) {
    console.error('❌ Error updating order status:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

// Hide Order from Admin (Admin)
app.put('/api/admin/orders/:orderId/hide', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`👁️ Hiding order from admin view: ${orderId}`);

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    const orderIndex = orders.findIndex(
      o => o.orderId === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    orders[orderIndex].hiddenFromAdmin = true;

    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );

    console.log(`✅ Order ${orderId} hidden from admin view (still visible to user)`);
    
    res.json({ 
      success: true, 
      message: `Order ${orderId} hidden from admin view`,
      note: 'Order is still visible to the customer for reordering'
    });

  } catch (error) {
    console.error('❌ Error hiding order:', error.message);
    res.status(500).json({ success: false, error: 'Failed to hide order' });
  }
});

// Unhide Order (Admin)
app.put('/api/admin/orders/:orderId/unhide', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    const orderIndex = orders.findIndex(
      o => o.orderId === orderId
    );
    
    if (orderIndex === -1) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    orders[orderIndex].hiddenFromAdmin = false;

    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );
    
    res.json({ 
      success: true, 
      message: `Order ${orderId} restored to admin view`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unhide order' });
  }
});

// Get Hidden Orders (Admin)
app.get('/api/admin/orders/hidden', requireAdmin, async (req, res) => {
  try {
    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }
    const hiddenOrders = orders.filter(order => order.hiddenFromAdmin).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, orders: hiddenOrders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hidden orders' });
  }
});

// Permanently Delete Order (Admin)
app.delete('/api/admin/orders/:orderId', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`🗑️ PERMANENTLY deleting order: ${orderId}`);

    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }

    const orderIndex = orders.findIndex(
      o => o.orderId === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    const orderToDelete = orders[orderIndex];
    orders = orders.filter(o => o.orderId !== orderId);

    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );

    // Remove order from user's orders array
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }

    const userIndex = users.findIndex(u => u.email === orderToDelete.userEmail);
    if (userIndex !== -1 && users[userIndex].orders) {
      users[userIndex].orders = users[userIndex].orders.filter(
        o => o.orderId !== orderId
      );
      
      fs.writeFileSync(
        usersFile,
        JSON.stringify(users, null, 2)
      );
    }

    console.log(`✅ Order ${orderId} PERMANENTLY deleted from database`);
    
    res.json({ 
      success: true, 
      message: `Order ${orderId} permanently deleted`,
      warning: 'This order is completely removed from the system'
    });

  } catch (error) {
    console.error('❌ Error deleting order:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
});

// Clear All Orders (Admin)
app.delete('/api/admin/orders/clear-all', requireAdmin, async (req, res) => {
  try {
    console.log('🗑️ Clearing ALL orders from database...');
    
    // Clear orders file
    fs.writeFileSync(ordersFile, JSON.stringify([], null, 2));
    
    // Clear orders from all users
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }
    
    for (const user of users) {
      user.orders = [];
    }
    
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );
    
    console.log(`✅ All orders cleared from database`);
    
    res.json({ 
      success: true, 
      message: `All orders cleared successfully`
    });

  } catch (error) {
    console.error('❌ Error clearing all orders:', error.message);
    res.status(500).json({ success: false, error: 'Failed to clear all orders' });
  }
});

// Bulk Update Orders Status (Admin)
app.put('/api/admin/orders/bulk-update', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    console.log(`🔄 Bulk updating all orders to: ${status}`);
    
    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }
    
    let updatedCount = 0;
    for (const order of orders) {
      if (!order.hiddenFromAdmin) {
        order.status = status;
        updatedCount++;
      }
    }
    
    fs.writeFileSync(
      ordersFile,
      JSON.stringify(orders, null, 2)
    );
    
    // Update all users' orders
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }
    
    for (const user of users) {
      if (user.orders) {
        for (const userOrder of user.orders) {
          userOrder.status = status;
        }
      }
    }
    
    fs.writeFileSync(
      usersFile,
      JSON.stringify(users, null, 2)
    );
    
    console.log(`✅ Bulk update completed: ${updatedCount} orders updated`);
    
    res.json({ 
      success: true, 
      message: `${updatedCount} orders updated to ${status}`,
      updatedCount: updatedCount
    });

  } catch (error) {
    console.error('❌ Error bulk updating orders:', error.message);
    res.status(500).json({ success: false, error: 'Failed to bulk update orders' });
  }
});

// Get All Users (Admin)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    let users = [];
    if (fs.existsSync(usersFile)) {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }
    
    const userData = users.map(user => ({
      email: user.email,
      name: user.name,
      phone: user.phone,
      whatsappNumber: user.whatsappNumber,
      orders: user.orders || [],
      createdAt: user.createdAt || new Date()
    }));
    
    res.json({ success: true, users: userData });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Get User Orders (Admin)
app.get('/api/admin/users/:email/orders', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }
    
    const userOrders = orders
      .filter(order => order.userEmail === email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ success: true, orders: userOrders });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user orders' });
  }
});

// Admin Test Endpoint
app.get('/api/admin/test', requireAdmin, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin API is working!',
    endpoints: {
      getOrders: 'GET /api/admin/orders',
      updateStatus: 'PUT /api/admin/orders/:orderId/status',
      deleteOrder: 'DELETE /api/admin/orders/:orderId',
      clearAll: 'DELETE /api/admin/orders/clear-all',
      bulkUpdate: 'PUT /api/admin/orders/bulk-update',
      getUsers: 'GET /api/admin/users',
      getUserOrders: 'GET /api/admin/users/:email/orders'
    }
  });
});

// ========== ACCOUNTING SUMMARY ==========
app.get('/api/admin/accounting/summary', requireAdmin, async (req, res) => {
  try {
    let orders = [];
    if (fs.existsSync(ordersFile)) {
      orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
    }
    
    // Filter out hidden orders for accounting
    const visibleOrders = orders.filter(order => !order.hiddenFromAdmin);
    
    let totalSales = 0;
    let totalCost = 0;
    let totalExpenses = 0;
    
    for (const order of visibleOrders) {
      totalSales += order.total || 0;
      
      // Calculate cost from items (if available)
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          // If costPrice is not available, estimate at 60% of price
          const costPrice = item.costPrice || (item.price * 0.6);
          totalCost += costPrice * (item.qty || 1);
        }
      }
    }
    
    const totalProfit = totalSales - totalCost - totalExpenses;
    
    res.json({
      success: true,
      summary: {
        sales: totalSales,
        cost: totalCost,
        expenses: totalExpenses,
        profit: totalProfit,
        profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
        orderCount: visibleOrders.length
      }
    });
  } catch (error) {
    console.error('❌ Error generating accounting summary:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate accounting summary' 
    });
  }
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TURBO WHEELS - ECOMMERCE BACKEND');
  console.log('='.repeat(60));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  if (process.env.BREVO_API_KEY) {
    console.log("📧 Email: READY ✓");
} else {
    console.log("📧 Email: NOT CONFIGURED ✗");
}  console.log(`🔐 Registration OTP: ENABLED ✓`);
  console.log(`💰 Profit Tracking: ENABLED ✓`);
  console.log(`👁️ Hidden Orders System: ENABLED ✓`);
  console.log('='.repeat(60));
  
 
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});