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
    origin: ["http://localhost:3000", "https://ebook-hazel-psi.vercel.app"], // Allowed domains
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

// Load book data from JSON file
const bookDataPath = path.join(__dirname, "book.json");
let bookData = {};

if (fs.existsSync(bookDataPath)) {
  bookData = JSON.parse(fs.readFileSync(bookDataPath, "utf8"));
} else {
  console.error("book.json file not found!");
}

// Serve static files from the "Images" folder
app.use("/Images", express.static(path.join(__dirname, "Images")));

const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";

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
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    return res.status(401).json({ message: "No token provided, authorization denied" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

// ==================== NEW: Like and Comment Endpoints ====================

// Like/Unlike a book
app.post("/book/:category/:title/like", authMiddleware, async (req, res) => {
  const { category, title } = req.params;
  const userId = req.user.userId;

  try {
    // Check if the user already liked the book
    const existingLike = await Like.findOne({
      user: userId,
      bookTitle: title,
      bookCategory: category,
    });

    if (existingLike) {
      // Unlike: Remove the like
      await Like.deleteOne({ _id: existingLike._id });
      res.status(200).json({ liked: false });
    } else {
      // Like: Add a new like
      const newLike = new Like({
        user: userId,
        bookTitle: title,
        bookCategory: category,
      });
      await newLike.save();
      res.status(200).json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Add a comment to a book
app.post("/book/:category/:title/comment", authMiddleware, async (req, res) => {
  const { category, title } = req.params;
  const { text } = req.body;
  const userId = req.user.userId;

  try {
    const newComment = new Comment({
      user: userId,
      bookTitle: title,
      bookCategory: category,
      text,
    });
    await newComment.save();
    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get likes and comments for a book
app.get("/book/:category/:title/details", async (req, res) => {
  const { category, title } = req.params;

  try {
    const likes = await Like.countDocuments({ bookTitle: title, bookCategory: category });
    const comments = await Comment.find({ bookTitle: title, bookCategory: category })
      .populate("user", "name") // Populate user details
      .sort({ createdAt: -1 }); // Sort by latest comments

    res.status(200).json({ likes, comments });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ==================== Existing Endpoints ====================

// API to get all books
app.get("/books", (req, res) => {
  res.json(bookData);
});

// API to get all categories
app.get("/categories", (req, res) => {
  const categories = Object.keys(bookData.categories).map((category) => ({
    categoryName: bookData.categories[category].name,
    imageURL: `${backendUrl}/${bookData.categories[category].image}`,
  }));
  res.json(categories);
});

// API to get all books by category
app.get("/books/:category", (req, res) => {
  const category = req.params.category;
  if (bookData[category]) {
    const booksWithImages = bookData[category].map((book) => ({
      ...book,
      image: `${backendUrl}/${book.image}`,
    }));
    res.json(booksWithImages);
  } else {
    res.status(404).json({ message: "Category not found" });
  }
});

// API to get book details by category and title
app.get("/book/:category/:title", (req, res) => {
  const { category, title } = req.params;

  if (!bookData[category]) {
    return res.status(404).json({ message: "Category not found" });
  }

  const book = bookData[category].find(
    (b) => b.title.toLowerCase() === title.toLowerCase()
  );

  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }

  res.json(book);
});

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

// Default route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Server Listening
app.listen(4000, () => console.log("Server running on port 4000"));