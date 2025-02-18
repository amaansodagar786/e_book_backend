const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const session = require("express-session");
require("dotenv").config();

const app = express();

// Middleware
app.use(
  cors({
    origin: "*", // Allow all domains for testing
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed HTTP methods
    credentials: true, // Allow cookies & auth headers
  })
);
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_default_secret",
    resave: false,
    saveUninitialized: true,
  })
);

// MongoDB Connection
mongoose
  .connect(
    "mongodb+srv://sodagaramaan786:HbiVzsmAJNAm4kg4@cluster0.576stzr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));





// ==================== NEW: Like and Comment Schemas ====================
const likeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "Register" }, // User who liked
  bookTitle: { type: String, required: true }, // Book title from JSON
  bookCategory: { type: String, required: true }, // Book category from JSON
});

const Like = mongoose.model("Like", likeSchema);

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "Register" }, // User who commented
  bookTitle: { type: String, required: true }, // Book title from JSON
  bookCategory: { type: String, required: true }, // Book category from JSON
  text: { type: String, required: true }, // Comment text
  createdAt: { type: Date, default: Date.now }, // Timestamp
});

const Comment = mongoose.model("Comment", commentSchema);

// Middleware to protect routes
// const authMiddleware = (req, res, next) => {
//   const token = req.header("Authorization");
//   if (!token) {
//     return res.status(401).json({ message: "No token provided, authorization denied" });
//   }
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
//     req.user = decoded;
//     next();
//   } catch (error) {
//     res.status(401).json({ message: "Token is not valid" });
//   }
// };

// ==================== NEW: Like and Comment Endpoints ====================


// Add a comment to a book



// Register Schema & Model

const RegisterSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
});

const Register = mongoose.model("Register", RegisterSchema);

// Register Route
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  console.log({ name, email, password });
  try {
    const existingUser = await Register.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new Register({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Register.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );
    res.status(200).json({ 
      message: "Login successful", 
      token,
      userId: user._id,  // Sending explicitly
      email: user.email  // Sending explicitly
    });  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Middleware to protect routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided, authorization denied" });
  }

  const token = authHeader.split(" ")[1]; // Extract token after "Bearer"

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

// Protected route example
app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await Register.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Like/Unlike
app.post("/like", authMiddleware, async (req, res) => {
  const { bookTitle, bookCategory } = req.body;
  const userId = req.user.userId;

  try {
    const existingLike = await Like.findOne({ user: userId, bookTitle, bookCategory });
    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id });
      res.json({ liked: false });
    } else {
      const newLike = new Like({ user: userId, bookTitle, bookCategory });
      await newLike.save();
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/comment", authMiddleware, async (req, res) => {
  const { bookTitle, bookCategory, text } = req.body;
  const userId = req.user.userId;

  try {
    const newComment = new Comment({ user: userId, bookTitle, bookCategory, text });
    await newComment.save();
    res.json(newComment);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Get Likes/Comments for a Book
// Get Likes/Comments for a Book

app.get("/details", async (req, res) => {
  const { bookTitle, bookCategory, userId } = req.query;

  try {
    const likesCount = await Like.countDocuments({ bookTitle, bookCategory });
    const userLike = userId ? await Like.findOne({ 
      bookTitle, 
      bookCategory,
      user: userId 
    }) : null;

    const comments = await Comment.find({ bookTitle, bookCategory })
      .populate("user", "name");

    res.json({ 
      likes: likesCount,
      isLiked: !!userLike,
      comments 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Default route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Server Listening
app.listen(4000, () => console.log("Server running on port 4000"));