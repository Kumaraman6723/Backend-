const mongoose = require("mongoose");
const User = require("./models/User");

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/lost-and-found",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

async function updateUserSchema() {
  try {
    console.log("Starting user schema update...");

    // Update all existing users to include verified fields
    const result = await User.updateMany(
      { verified: { $exists: false } }, // Find users without verified field
      {
        $set: {
          verified: false,
          verifiedAt: null,
        },
      }
    );

    console.log(`Updated ${result.modifiedCount} users with verified fields`);

    // Verify the update
    const users = await User.find({});
    console.log(`Total users in database: ${users.length}`);

    users.forEach((user) => {
      console.log(
        `User: ${user.email}, Verified: ${user.verified}, VerifiedAt: ${user.verifiedAt}`
      );
    });

    console.log("User schema update completed successfully!");
  } catch (error) {
    console.error("Error updating user schema:", error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the migration
updateUserSchema();
