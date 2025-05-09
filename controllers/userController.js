const User = require('../models/userModel')
const Otp = require('../models/otpModel')
const bcrypt = require('bcrypt')
const nodemailer = require('nodemailer')
const crypto = require('crypto')
const sendResetPasswordEmail = require("../services/forgotEmailService")
const Contact = require("../models/contactModel")
const { securePassword } = require('../utils/securePassword')
const { handleReferral } = require('../utils/referralHelper')
const { generateSecureOTP } = require('../utils/generateOtpHelper')



// Function to insert user
const insertUser = async (req, res, next) => {
    try {
        const { name, email, mobile, password, referralCode } = req.body;
        // Check if the user already exists by mobile
        const existingUserByMobile = await User.findOne({ mobile });
        // If user already exists by mobile and is not verified
        if (existingUserByMobile) {
            if (!existingUserByMobile.isVerified) {
                await handleReferral(referralCode || null, existingUserByMobile._id);
                const otp = generateSecureOTP();
                res.cookie('email', email); // Store email in cookie for verification
                await sendVerifyOtp(name, email, otp); // Send OTP to user's email
                return res.status(200).json({
                    status: true,
                    url: '/verifyOtp'
                });
            }
            return res.status(400).json({ success: false, message: 'Phone Number Already Exists. Please Use a Different Phone Number.' });
        }

        // Check if the user already exists by email
        const existingUserByEmail = await User.findOne({ email });
        // If user already exists by email and is not verified
        if (existingUserByEmail) {
            if (!existingUserByEmail.isVerified) {
                await handleReferral(referralCode || null, existingUserByEmail._id);
                const otp = generateSecureOTP();
                res.cookie('email', email); // Store email in cookie for verification
                await sendVerifyOtp(name, email, otp); // Send OTP to user's email
                return res.status(200).json({
                    status: true,
                    url: '/verifyOtp'
                });
            }
            return res.status(400).json({ success: false, message: 'Email Already Exists. Please Use a Different Email.' });
        }

        // Create a new user if neither mobile nor email exists
        const hashedPassword = await securePassword(password);
        const user = new User({
            name,
            email,
            mobile,
            password: hashedPassword,
        });

        const userData = await user.save();

        // Handle referral if provided, else create a new referral for the user
        await handleReferral(referralCode || null, userData._id);
        // Generate OTP and send it to the user's email for verification
        const otp = generateSecureOTP();
        res.cookie('email', email); // Store email in cookie for verification
        await sendVerifyOtp(name, email, otp); // Send OTP to user's email

        return res.status(200).json({
            status: true,
            url: '/verifyOtp'
        });

    } catch (error) {
        next(error);
    }
};



// this for sendVerifyOtp function to accept otp parameter
const sendVerifyOtp = async (name, email, otp) => {
    try {
        const expiryTime = new Date(Date.now() + 2 * 60 * 1000); // OTP expires in 2 minutes

        // Create a nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        // Send OTP to user's email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP For Verification',
            text: `Hello ${name},\n\nYour OTP is: ${otp}\n\nThis OTP is valid for 1 minutes.`
        };

        await transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return res.status(500).json({ success: false, message: 'Internal mail Server Error. Please try again later.' });
            }
        });

        // Save OTP record to the database
        const otpRecord = new Otp({
            email,
            otp,
            expiryTime
        });
        await otpRecord.save(); // Save OTP record to the database

    } catch (error) {
        throw error;
    }
};



// for verifyOtp verification
const verifyOtp = async (req, res, next) => {
    try {
        const { otp1, otp2, otp3, otp4, otp5, otp6 } = req.body;
        const otp = otp1 + otp2 + otp3 + otp4 + otp5 + otp6; // Concatenate OTP digits
        // Validate if all OTP digits are provided
        if (![otp1, otp2, otp3, otp4, otp5, otp6].every(otpDigit => otpDigit && otpDigit.length === 1)) {
            return res.status(400).json({ success: false, message: 'Invalid OTP format.' });
        }

        // Find the corresponding OTP record
        const otpRecord = await Otp.findOne({ email: req.cookies.email, otp });
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }
        // Check OTP expiry
        if (otpRecord.expiryTime < Date.now()) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }
        //for updating is_verified
        await User.updateOne({ email: req.cookies.email }, { isVerified: true });
        // OTP is valid, clear the OTP cookie
        res.clearCookie('email');
        // Delete OTP record from the database
        await Otp.findByIdAndDelete(otpRecord._id);
        return res.status(200).json({
            status: true,
            url: '/login'
        });

    } catch (error) {
        next(error);
    }
};



//resend otp
const resendOtp = async (req, res, next) => {
    try {
        const email = req.cookies.email;
        // Check if email exists in the database
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return res.status(400).json({ success: false, message: 'Email does not exist.' });
        }
        await Otp.deleteMany({ email })

        // Generate a new OTP
        const otp = generateSecureOTP();
        // Send the OTP to the user's email
        await sendVerifyOtp(existingUser.name, email, otp);

        res.status(200).json({ success: true, message: 'OTP has been sent to your email.' });

    } catch (error) {
        next(error);
    }
}



// for verifying login
const verifyLogin = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const userData = await User.findOne({ email });
        if (userData) {
            const passwordMatch = await bcrypt.compare(password, userData.password);
            if (passwordMatch) {
                if (userData.isVerified === true) {
                    if (userData.isBlocked === false) {
                        // Set user_id in session and redirect
                        req.session.user_id = userData._id;
                        return res.status(200).json({
                            status: true,
                            url: '/'
                        });

                    } else {
                        return res.status(400).json({ success: false, message: 'Your account is blocked.' });
                    }
                } else {
                    return res.status(400).json({ success: false, message: 'Your account is not verified yet.' });
                }
            } else {
                return res.status(400).json({ success: false, message: 'Email and Password is incorrect.' });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Email and Password is incorrect.' });
        }

    } catch (error) {
        next(error);
    }
}



//for user logout
const userLogout = async (req, res, next) => {
    try {
        req.session.destroy(err => {
            if (err) {
                next(error);
            }

            res.clearCookie(process.env.SESSION_NAME); // Clear the session cookie
            res.redirect('/');
        });

    } catch (error) {
        next(error);
    }
};



//for send password 
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found.' });
        }
        if (user.isVerified === 0) {
            return res.status(400).json({ success: false, message: 'Please verify your email.' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        await User.updateOne({ email: email }, { $set: { token: token } });
        sendResetPasswordEmail(user.name, user.email, token);

        return res.status(200).json({ success: true, message: 'Please check your mail to reset your password.' });

    } catch (error) {
        next(error);
    }
};



//for verify reset password
const verifyResetPassword = async (req, res, next) => {
    try {
        const { password, user_id } = req.body;
        if (password && user_id) {
            const spassword = await securePassword(password);
            await User.findByIdAndUpdate(
                { _id: user_id },
                {
                    $set: {
                        password: spassword,
                        token: ''
                    }
                }
            );
            return res.status(200).json({ url: "/login", success: true, message: 'Your password has been reset successfully.' });
        }

    } catch (error) {
        next(error);
    }
};


//for contact us
const contactUs = async (req, res, next) => {
    try {
        const { name, email, message } = req.body;

        const newContact = new Contact({ name, email, message });
        await newContact.save();

        return res.status(200).json({ success: true, message: "Message sent successfully!" });

    } catch (error) {
        next(error);
    }
};



module.exports = {
    securePassword,
    insertUser,
    sendVerifyOtp,
    verifyOtp,
    verifyLogin,
    resendOtp,
    userLogout,
    forgotPassword,
    verifyResetPassword,
    contactUs
}