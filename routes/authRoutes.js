const express = require("express");
const {
  sendOTP,
  verifyOTP,
  directLogin,
  checkVerificationStatus,
} = require("../controllers/authController");
const router = express.Router();

router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/direct-login", directLogin);
router.get("/check-verification/:email", checkVerificationStatus);

module.exports = router;
