// routes/user.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";
import { isBoundedString, isFiniteNumber, isRecord } from "../middleware/validation.js";

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
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { name, interestCriteria, notifyByEmail } = req.body;
    const allowedFields = new Set(["name", "interestCriteria", "notifyByEmail"]);
    if (Object.keys(req.body).some((field) => !allowedFields.has(field))) {
      return res.status(400).json({ message: "มีข้อมูลบางส่วนที่ไม่รองรับ กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    if (name !== undefined && !isBoundedString(name, 1, 100)) {
      return res.status(400).json({ message: "ชื่อต้องมีความยาว 1–100 ตัวอักษร" });
    }
    if (notifyByEmail !== undefined && typeof notifyByEmail !== "boolean") {
      return res.status(400).json({ message: "การแจ้งเตือนทางอีเมลต้องเลือกเป็นเปิดหรือปิด" });
    }
    if (interestCriteria !== undefined && !isRecord(interestCriteria)) {
      return res.status(400).json({ message: "รูปแบบเงื่อนไขการแจ้งเตือนไม่ถูกต้อง" });
    }
    if (isRecord(interestCriteria)) {
      const allowedCriteria = new Set(["categories", "agencies", "keywords", "minBudget", "maxBudget", "fiscalYear"]);
      if (Object.keys(interestCriteria).some((field) => !allowedCriteria.has(field))) {
        return res.status(400).json({ message: "มีเงื่อนไขการแจ้งเตือนบางรายการที่ไม่รองรับ" });
      }
      for (const field of ["categories", "agencies", "keywords"] as const) {
        const values = interestCriteria[field];
        if (values !== undefined && (!Array.isArray(values) || values.length > 20 ||
          !values.every((value) => isBoundedString(value, 1, 100)))) {
          return res.status(400).json({ message: "รายการหมวดหมู่ หน่วยงาน หรือคำค้นหา ต้องมีไม่เกิน 20 รายการ และแต่ละรายการยาว 1–100 ตัวอักษร" });
        }
      }
      for (const field of ["minBudget", "maxBudget"] as const) {
        const value = interestCriteria[field];
        if (value !== undefined && value !== null && !isFiniteNumber(value, 0, 1_000_000_000_000_000)) {
          return res.status(400).json({ message: "งบประมาณต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" });
        }
      }
      const fiscalYear = interestCriteria.fiscalYear;
      if (fiscalYear !== undefined && fiscalYear !== null &&
        (!isFiniteNumber(fiscalYear, 1900, 2200) || !Number.isInteger(fiscalYear))) {
        return res.status(400).json({ message: "ปีงบประมาณต้องเป็นจำนวนเต็มระหว่าง 1900 ถึง 2200" });
      }
      const minBudget = interestCriteria.minBudget;
      const maxBudget = interestCriteria.maxBudget;
      if (typeof minBudget === "number" && typeof maxBudget === "number" && minBudget > maxBudget) {
        return res.status(400).json({ message: "งบประมาณขั้นต่ำต้องไม่มากกว่างบประมาณขั้นสูง" });
      }
    }

    const user = await User.findById(req.user!.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (isRecord(interestCriteria)) {
      const currentMin = user.interestCriteria.minBudget;
      const currentMax = user.interestCriteria.maxBudget;
      const nextMin = interestCriteria.minBudget === null
        ? undefined
        : (interestCriteria.minBudget as number | undefined) ?? currentMin;
      const nextMax = interestCriteria.maxBudget === null
        ? undefined
        : (interestCriteria.maxBudget as number | undefined) ?? currentMax;
      if (typeof nextMin === "number" && typeof nextMax === "number" && nextMin > nextMax) {
        return res.status(400).json({ message: "งบประมาณขั้นต่ำต้องไม่มากกว่างบประมาณขั้นสูง" });
      }
    }

    if (typeof name === "string") user.name = name.trim();

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
    if (!isRecord(req.body)) {
      return res.status(400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" });
    }
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" || currentPassword.length === 0 ||
      typeof newPassword !== "string" || newPassword.length === 0) {
      return res.status(400).json({
        message: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่ให้ครบถ้วน",
      });
    }

    if (Buffer.byteLength(currentPassword, "utf8") > 72 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ message: "รหัสผ่านยาวเกินไป กรุณาใช้รหัสผ่านที่สั้นลง" });
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