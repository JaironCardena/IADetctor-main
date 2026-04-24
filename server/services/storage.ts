import fs from 'fs/promises';
import { createReadStream } from 'fs';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type BucketName = 'originals' | 'results' | 'vouchers';

class StorageService {
  private getBucket(bucketName: BucketName) {
    if (!mongoose.connection.db) {
      throw new Error('Database not connected');
    }
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName
    });
  }

  /**
   * Uploads a file to MongoDB GridFS and deletes the local temporary file.
   */
  async uploadLocalFile(bucketName: BucketName, destPath: string, localFilePath: string, contentType?: string): Promise<string> {
    try {
      const bucket = this.getBucket(bucketName);
      
      return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(destPath, {
          metadata: { contentType: contentType || 'application/octet-stream' }
        });
        
        createReadStream(localFilePath)
          .pipe(uploadStream)
          .on('error', (err) => {
            console.error(`Error uploading to GridFS (${bucketName}/${destPath}):`, err);
            reject(err);
          })
          .on('finish', async () => {
            // Cleanup local temp file
            await fs.unlink(localFilePath).catch(err => console.warn(`Failed to delete temp file ${localFilePath}:`, err));
            resolve(destPath);
          });
      });
    } catch (error) {
      console.error('uploadLocalFile failed:', error);
      throw error;
    }
  }

  /**
   * Generates a signed URL for downloading a file from our own server.
   */
  async getSignedUrl(bucket: BucketName, filePath: string, expiresIn: number = 60): Promise<string | null> {
    try {
      const token = jwt.sign({ bucket, filePath }, env.JWT_SECRET, { expiresIn });
      return `/api/download/storage?token=${token}`;
    } catch (error) {
      console.error(`Error creating signed URL for ${bucket}/${filePath}:`, error);
      return null;
    }
  }

  /**
   * Deletes a file from MongoDB GridFS
   */
  async deleteFile(bucketName: BucketName, filePath: string): Promise<boolean> {
    try {
      const bucket = this.getBucket(bucketName);
      const files = await bucket.find({ filename: filePath }).toArray();
      if (files.length === 0) return true; // Already deleted or doesn't exist
      
      for (const file of files) {
        await bucket.delete(file._id);
      }
      return true;
    } catch (error) {
      console.error(`Error deleting file ${bucketName}/${filePath}:`, error);
      return false;
    }
  }

  /**
   * Streams a file from GridFS to a writeable stream (like express Response)
   */
  async streamFile(bucketName: BucketName, filePath: string, pipeTo: NodeJS.WritableStream): Promise<void> {
    const bucket = this.getBucket(bucketName);
    const files = await bucket.find({ filename: filePath }).toArray();
    if (files.length === 0) {
      throw new Error('File not found in GridFS');
    }
    const downloadStream = bucket.openDownloadStream(files[0]._id);
    downloadStream.pipe(pipeTo);
  }

  /**
   * Downloads a file from GridFS into a Buffer
   */
  async getFileBuffer(bucketName: BucketName, filePath: string): Promise<Buffer | null> {
    try {
      const bucket = this.getBucket(bucketName);
      const files = await bucket.find({ filename: filePath }).toArray();
      if (files.length === 0) return null;

      const downloadStream = bucket.openDownloadStream(files[0]._id);
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        downloadStream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        downloadStream.on('error', err => reject(err));
        downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      console.error(`Error getting file buffer ${bucketName}/${filePath}:`, error);
      return null;
    }
  }

  /**
   * Deletes files for tickets older than 48 hours to save space.
   */
  async cleanupExpiredFiles(): Promise<void> {
    try {
      const { db } = await import('./database');
      
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const expiredTickets = await db.getTicketsOlderThan(fortyEightHoursAgo);
      
      for (const ticket of expiredTickets) {
        let updated = false;
        
        if (ticket.filePath && !ticket.filePath.includes('/') && !ticket.filePath.includes('\\')) {
          await this.deleteFile('originals', ticket.filePath);
          ticket.filePath = '';
          updated = true;
        }

        if (ticket.plagiarismPdfPath && !ticket.plagiarismPdfPath.includes('/') && !ticket.plagiarismPdfPath.includes('\\')) {
          await this.deleteFile('results', ticket.plagiarismPdfPath);
          ticket.plagiarismPdfPath = '';
          updated = true;
        }

        if (ticket.aiPdfPath && !ticket.aiPdfPath.includes('/') && !ticket.aiPdfPath.includes('\\')) {
          await this.deleteFile('results', ticket.aiPdfPath);
          ticket.aiPdfPath = '';
          updated = true;
        }
        
        if (updated) {
           await db.clearTicketFiles(ticket.id);
        }
      }
      console.log(`[Cron] Cleanup expired files completed. Processed ${expiredTickets.length} tickets.`);
    } catch (error) {
      console.error('[Cron] Error cleaning up expired files:', error);
    }
  }
}

export const storageService = new StorageService();
