// controllers/authController.js
const User = require("../models/User");
const OTP = require("../models/OTP");
const nodemailer = require("nodemailer");
const otpGenerator = require("otp-generator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const https = require("https");
const querystring = require("querystring");

// MAIL transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Generate and send OTP
const sendOTP = async (req, res) => {
  const { email, role } = req.body;

  try {
    // Validate MAIL domain based on role
    if (
      role === "admin" &&
      !["kumarprasadaman1234@gmail.com", "drizzle003.ace@gmail.com"].includes(
        email
      )
    ) {
      return res.status(400).json({ message: "Invalid admin MAIL" });
    }

    if (
      role === "user" &&
      !(email.endsWith("@ncuindia.edu") || email === "study.drizzle@gmail.com")
    ) {
      return res.status(400).json({ message: "Invalid MAIL domain" });
    }

    // Generate OTP (6 digits only)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP to database
    await OTP.findOneAndDelete({ email }); // Delete existing OTP
    const newOTP = new OTP({ email, otp });
    await newOTP.save();

    // Send MAIL
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Lost & Found - NCU OTP Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Lost & Found - NCU</h2>
          <p>Your OTP for verification is:</p>
          <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
          <p>This OTP will expire in 5 minutes.</p>
          <p>If you didn't request this OTP, please ignore this MAIL.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Error sending OTP" });
  }
};

// Verify OTP and login
const verifyOTP = async (req, res) => {
  const { email, otp, role, recaptchaToken } = req.body;

  try {
    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res
        .status(400)
        .json({ message: "Please complete the reCAPTCHA verification" });
    }

    // Verify reCAPTCHA with Google
    const recaptchaData = await new Promise((resolve, reject) => {
      const postData = querystring.stringify({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      });

      const options = {
        hostname: "www.google.com",
        port: 443,
        path: "/recaptcha/api/siteverify",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
    if (!recaptchaData.success) {
      return res.status(400).json({ message: "reCAPTCHA verification failed" });
    }

    // Find OTP in database
    const otpRecord = await OTP.findOne({ email, otp });
    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Check if OTP is expired (5 minutes)
    const now = new Date();
    const otpTime = new Date(otpRecord.createdAt);
    const diffInMinutes = (now - otpTime) / (1000 * 60);

    if (diffInMinutes > 5) {
      await OTP.findOneAndDelete({ email });
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      // Extract name from MAIL for new users
      const emailParts = email.split("@")[0];
      const nameParts = emailParts.split(".");
      const firstName = nameParts[0]
        ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)
        : "User";
      const lastName = nameParts[1]
        ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1)
        : "";

      user = new User({
        firstName,
        lastName,
        email,
        role,
        verified: true,
        verifiedAt: new Date(),
      });
    } else {
      // Update verification status for existing users
      user.verified = true;
      user.verifiedAt = new Date();
      user.role = role;
    }

    await user.save();

    // Delete OTP after successful verification
    await OTP.findOneAndDelete({ email });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Add token to user object
    user.token = token;

    res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Error verifying OTP" });
  }
};

// Direct login for verified users
const directLogin = async (req, res) => {
  const { email, role, recaptchaToken } = req.body;

  try {
    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res
        .status(400)
        .json({ message: "Please complete the reCAPTCHA verification" });
    }

    const recaptchaData = await new Promise((resolve, reject) => {
      const postData = querystring.stringify({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      });

      const options = {
        hostname: "www.google.com",
        port: 443,
        path: "/recaptcha/api/siteverify",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
    if (!recaptchaData.success) {
      return res.status(400).json({ message: "reCAPTCHA verification failed" });
    }

    // Validate MAIL domain based on role
    if (
      role === "admin" &&
      !["kumarprasadaman1234@gmail.com", "drizzle003.ace@gmail.com"].includes(
        email
      )
    ) {
      return res.status(400).json({ message: "Invalid admin MAIL" });
    }

    if (
      role === "user" &&
      !(email.endsWith("@ncuindia.edu") || email === "study.drizzle@gmail.com")
    ) {
      return res.status(400).json({ message: "Invalid MAIL domain" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        message: "User not found. Please use OTP verification first.",
      });
    }

    if (!user.verified) {
      return res.status(400).json({
        message: "User not verified. Please use OTP verification first.",
      });
    }

    // Update role if needed
    if (user.role !== role) {
      user.role = role;
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Add token to user object
    user.token = token;

    res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    console.error("Error during direct login:", error);
    res.status(500).json({ message: "Error during login" });
  }
};

// Check if user is verified
const checkVerificationStatus = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ verified: user.verified });
  } catch (error) {
    console.error("Error checking verification status:", error);
    res.status(500).json({ message: "Error checking verification status" });
  }
};

module.exports = { sendOTP, verifyOTP, directLogin, checkVerificationStatus };
