// routes/user.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user!.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      interestCriteria: user.interestCriteria,
      notifyByEmail: user.notifyByEmail,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const { name, interestCriteria, notifyByEmail } = req.body;

    const user = await User.findById(req.user!.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }

    if (interestCriteria && typeof interestCriteria === "object") {
      const {
        categories,
        agencies,
        keywords,
        minBudget,
        maxBudget,
        fiscalYear,
      } = interestCriteria;

      if (Array.isArray(categories)) user.interestCriteria.categories = categories;
      if (Array.isArray(agencies)) user.interestCriteria.agencies = agencies;
      if (Array.isArray(keywords)) user.interestCriteria.keywords = keywords;
      if (typeof minBudget === "number" || minBudget === null) {
        user.interestCriteria.minBudget = minBudget ?? undefined;
      }
      if (typeof maxBudget === "number" || maxBudget === null) {
        user.interestCriteria.maxBudget = maxBudget ?? undefined;
      }
      if (typeof fiscalYear === "number" || fiscalYear === null) {
        user.interestCriteria.fiscalYear = fiscalYear ?? undefined;
      }
    }

    if (typeof notifyByEmail === "boolean") {
      user.notifyByEmail = notifyByEmail;
    }

    await user.save();

    return res.json({
      message: "Profile updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        interestCriteria: user.interestCriteria,
        notifyByEmail: user.notifyByEmail,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

router.put("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const user = await User.findById(req.user!.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = new Date();
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to change password" });
  }
});

export default router;