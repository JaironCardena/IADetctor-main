import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import fs from 'fs/promises';
import path from 'path';

// Create a Supabase client with the service role key to bypass RLS for server-side operations
const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export type BucketName = 'originals' | 'results' | 'vouchers';

class StorageService {
  /**
   * Uploads a file to Supabase Storage and deletes the local temporary file.
   * @param bucket The destination bucket
   * @param destPath The destination path inside the bucket
   * @param localFilePath The path to the local temporary file
   * @param contentType Optional MIME type
   * @returns The path of the uploaded file in the bucket
   */
  async uploadLocalFile(bucket: BucketName, destPath: string, localFilePath: string, contentType?: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(localFilePath);
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(destPath, fileBuffer, {
          contentType: contentType || 'application/octet-stream',
          upsert: true
        });

      if (error) {
        console.error(`Error uploading to Supabase Storage (${bucket}/${destPath}):`, error);
        throw error;
      }

      // Cleanup local temp file
      await fs.unlink(localFilePath).catch(err => console.warn(`Failed to delete temp file ${localFilePath}:`, err));

      return data.path;
    } catch (error) {
      console.error('uploadLocalFile failed:', error);
      throw error;
    }
  }

  /**
   * Generates a short-lived signed URL for downloading a file securely.
   * @param bucket The bucket name
   * @param filePath The path inside the bucket
   * @param expiresIn Seconds until the URL expires (default 60s)
   */
  async getSignedUrl(bucket: BucketName, filePath: string, expiresIn: number = 60): Promise<string | null> {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error || !data) {
      console.error(`Error creating signed URL for ${bucket}/${filePath}:`, error);
      return null;
    }

    return data.signedUrl;
  }

  /**
   * Deletes a file from Supabase Storage
   * @param bucket The bucket name
   * @param filePath The path inside the bucket
   */
  async deleteFile(bucket: BucketName, filePath: string): Promise<boolean> {
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error(`Error deleting file ${bucket}/${filePath}:`, error);
      return false;
    }
    return true;
  }

  /**
   * Deletes files for tickets older than 48 hours to save space.
   */
  async cleanupExpiredFiles(): Promise<void> {
    try {
      // Need to dynamically import db to avoid circular dependencies if any
      const { db } = await import('./database');
      
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const expiredTickets = await db.getTicketsOlderThan(fortyEightHoursAgo);
      
      for (const ticket of expiredTickets) {
        let updated = false;
        
        // Delete original file
        if (ticket.filePath && !ticket.filePath.includes('/') && !ticket.filePath.includes('\\')) {
          await this.deleteFile('originals', ticket.filePath);
          ticket.filePath = ''; // Mark as deleted (handle in db)
          updated = true;
        }

        // Delete plagiarism report
        if (ticket.plagiarismPdfPath && !ticket.plagiarismPdfPath.includes('/') && !ticket.plagiarismPdfPath.includes('\\')) {
          await this.deleteFile('results', ticket.plagiarismPdfPath);
          ticket.plagiarismPdfPath = '';
          updated = true;
        }

        // Delete AI report
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
