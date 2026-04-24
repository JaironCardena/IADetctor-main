import mongoose from 'mongoose';

export interface HumanizerUsageDocument extends mongoose.Document {
  id: string;
  userId: string;
  wordsInput: number;
  wordsOutput: number;
  mode: 'text' | 'file';
  createdAt: string;
}

const HumanizerUsageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  wordsInput: { type: Number, required: true },
  wordsOutput: { type: Number, required: true },
  mode: { type: String, enum: ['text', 'file'], required: true },
  createdAt: { type: String, required: true },
}, {
  timestamps: false,
  versionKey: false,
});

// Compound index for efficient usage queries by user and date range
HumanizerUsageSchema.index({ userId: 1, createdAt: -1 });

export const HumanizerUsageModel = mongoose.models.HumanizerUsage as mongoose.Model<HumanizerUsageDocument>
  || mongoose.model<HumanizerUsageDocument>('HumanizerUsage', HumanizerUsageSchema);
