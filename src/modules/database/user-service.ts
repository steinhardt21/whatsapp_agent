import { executeQuery, executeQuerySingle } from './client.js';
import { 
  UserData, 
  CandidateData, 
  UserAppointment, 
  AppointmentData, 
  ChatHistoryData, 
  JobData, 
  JobOfferData,
  UserComplete, 
  UserWithAppointments 
} from './types.js';

/**
 * Get user data by WhatsApp ID (wa_id) from candidates table
 */
export async function getUserData(wa_id: string): Promise<UserData | null> {
  try {
    console.log(`🔍 Fetching candidate data for wa_id: ${wa_id}`);
    
    const query = `
      SELECT 
        id,
        first_name,
        last_name,
        phone,
        email,
        birth_date,
        street_name,
        street_number,
        city_cap_id,
        created_at,
        updated_at,
        cap,
        wa_id,
        connected
      FROM candidates 
      WHERE wa_id = $1
    `;
    
    const candidate = await executeQuerySingle<CandidateData>(query, [wa_id]);
    
    if (candidate) {
      // Create computed fields for compatibility
      const userData: UserData = {
        ...candidate,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        full_name: `${candidate.first_name} ${candidate.last_name}`.trim()
      };
      
      console.log(`✅ Candidate found: ${userData.name} (ID: ${userData.id})`);
      
      // Update connected status and updated_at
      await updateCandidateLastContact(wa_id);
      
      return userData;
    } else {
      console.log(`❌ No candidate found for wa_id: ${wa_id}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching candidate data for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Get user data with appointments
 */
export async function getUserWithAppointments(wa_id: string): Promise<UserWithAppointments | null> {
  try {
    const user = await getUserData(wa_id);
    if (!user) return null;

    const appointments = await getCandidateAppointments(user.id);
    
    return {
      ...user,
      appointments
    };
  } catch (error) {
    console.error(`❌ Error fetching user with appointments for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Get complete user data with appointments, chat history, and jobs
 */
export async function getUserComplete(wa_id: string, chatHistoryLimit: number = 9): Promise<UserComplete | null> {
  try {
    const user = await getUserData(wa_id);
    if (!user) return null;

    const [appointments, chatHistory, jobs] = await Promise.all([
      getCandidateAppointments(user.id),
      getCandidateChatHistory(user.id, chatHistoryLimit),
      getCandidateJobs(user.id)
    ]);
    
    return {
      ...user,
      appointments,
      chat_history: chatHistory,
      jobs
    };
  } catch (error) {
    console.error(`❌ Error fetching complete user data for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Get candidate appointments by candidate ID
 */
export async function getCandidateAppointments(candidate_id: string): Promise<UserAppointment[]> {
  try {
    const query = `
      SELECT 
        id,
        created_at,
        candidate_id,
        status,
        start_time,
        end_time,
        google_event_id
      FROM appointments 
      WHERE candidate_id = $1 
      ORDER BY start_time DESC
      LIMIT 20
    `;
    
    const appointments = await executeQuery<AppointmentData>(query, [candidate_id]);
    
    // Transform to UserAppointment format with computed fields
    const userAppointments: UserAppointment[] = appointments.map(apt => ({
      ...apt,
      duration_minutes: apt.start_time && apt.end_time 
        ? Math.round((new Date(apt.end_time).getTime() - new Date(apt.start_time).getTime()) / (1000 * 60))
        : undefined
    }));
    
    console.log(`📅 Found ${userAppointments.length} appointments for candidate: ${candidate_id}`);
    
    return userAppointments;
  } catch (error) {
    console.error(`❌ Error fetching appointments for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Get candidate appointments filtered by status
 */
export async function getCandidateAppointmentsByStatus(candidate_id: string, status: string): Promise<UserAppointment[]> {
  try {
    const query = `
      SELECT 
        id,
        created_at,
        candidate_id,
        status,
        start_time,
        end_time,
        google_event_id,
        timezone
      FROM appointments 
      WHERE candidate_id = $1 AND status = $2
      ORDER BY start_time DESC
      LIMIT 20
    `;
    
    const appointments = await executeQuery<AppointmentData>(query, [candidate_id, status]);
    
    // Transform to UserAppointment format with computed fields
    const userAppointments: UserAppointment[] = appointments.map(apt => ({
      ...apt,
      duration_minutes: apt.start_time && apt.end_time 
        ? Math.round((new Date(apt.end_time).getTime() - new Date(apt.start_time).getTime()) / (1000 * 60))
        : undefined
    }));
    
    console.log(`📅 Found ${userAppointments.length} appointments with status '${status}' for candidate: ${candidate_id}`);
    
    return userAppointments;
  } catch (error) {
    console.error(`❌ Error fetching appointments with status '${status}' for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Get candidate's planned appointments specifically
 */
export async function getCandidatePlannedAppointments(candidate_id: string): Promise<UserAppointment[]> {
  return getCandidateAppointmentsByStatus(candidate_id, 'planned');
}

/**
 * Get candidate chat history by candidate ID (using session_id as candidate_id)
 */
export async function getCandidateChatHistory(candidate_id: string, limit: number = 9): Promise<ChatHistoryData[]> {
  try {
    const query = `
      SELECT 
        id,
        session_id,
        message
      FROM n8n_chat_histories 
      WHERE session_id = $1 
      ORDER BY id DESC
      LIMIT $2
    `;
    
    const chatHistory = await executeQuery<ChatHistoryData>(query, [candidate_id, limit]);
    console.log(`💬 Found ${chatHistory.length} chat messages for candidate: ${candidate_id}`);
    
    return chatHistory.reverse(); // Return in chronological order (oldest first)
  } catch (error) {
    console.error(`❌ Error fetching chat history for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Get candidate jobs by candidate ID
 */
export async function getCandidateJobs(candidate_id: string): Promise<JobData[]> {
  try {
    const query = `
      SELECT 
        id,
        created_at,
        candidate_id,
        type,
        status,
        step,
        job_offer_interested,
        job_offer_category
      FROM job 
      WHERE candidate_id = $1 
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const jobs = await executeQuery<JobData>(query, [candidate_id]);
    console.log(`💼 Found ${jobs.length} jobs for candidate: ${candidate_id}`);
    
    return jobs;
  } catch (error) {
    console.error(`❌ Error fetching jobs for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Create or update candidate
 */
export async function createOrUpdateUser(wa_id: string, userData: Partial<UserData>): Promise<UserData> {
  try {
    // Check if candidate exists
    const existingUser = await getUserData(wa_id);
    
    if (existingUser) {
      // Update existing candidate
      return await updateCandidate(wa_id, userData);
    } else {
      // Create new candidate
      return await createCandidate(wa_id, userData);
    }
  } catch (error) {
    console.error(`❌ Error creating or updating candidate for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Create new candidate
 */
export async function createCandidate(wa_id: string, userData: Partial<UserData>): Promise<UserData> {
  try {
    // Split name into first_name and last_name if provided
    let firstName = userData.first_name || '';
    let lastName = userData.last_name || '';
    
    if (userData.name && !firstName && !lastName) {
      const nameParts = userData.name.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    const query = `
      INSERT INTO candidates (
        wa_id, first_name, last_name, email, phone, 
        birth_date, street_name, street_number, city_cap_id, cap, connected
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING *
    `;
    
    const params = [
      wa_id,
      firstName,
      lastName,
      userData.email || null,
      userData.phone || null,
      userData.birth_date || null,
      userData.street_name || null,
      userData.street_number || null,
      userData.city_cap_id || null,
      userData.cap || null,
      true // Set connected to true when creating via WhatsApp
    ];
    
    const candidate = await executeQuerySingle<CandidateData>(query, params);
    
    if (candidate) {
      const userData: UserData = {
        ...candidate,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        full_name: `${candidate.first_name} ${candidate.last_name}`.trim()
      };
      
      console.log(`✅ Created new candidate for wa_id: ${wa_id} (ID: ${userData.id})`);
      return userData;
    }
    
    throw new Error('Failed to create candidate');
  } catch (error) {
    console.error(`❌ Error creating candidate for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Update existing candidate
 */
export async function updateCandidate(wa_id: string, userData: Partial<UserData>): Promise<UserData> {
  try {
    const setParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // Handle name splitting
    if (userData.name && !userData.first_name && !userData.last_name) {
      const nameParts = userData.name.trim().split(' ');
      userData.first_name = nameParts[0] || '';
      userData.last_name = nameParts.slice(1).join(' ') || '';
    }
    
    // Build dynamic update query
    if (userData.first_name !== undefined) {
      setParts.push(`first_name = $${paramIndex++}`);
      params.push(userData.first_name);
    }
    
    if (userData.last_name !== undefined) {
      setParts.push(`last_name = $${paramIndex++}`);
      params.push(userData.last_name);
    }
    
    if (userData.email !== undefined) {
      setParts.push(`email = $${paramIndex++}`);
      params.push(userData.email);
    }
    
    if (userData.phone !== undefined) {
      setParts.push(`phone = $${paramIndex++}`);
      params.push(userData.phone);
    }
    
    if (userData.birth_date !== undefined) {
      setParts.push(`birth_date = $${paramIndex++}`);
      params.push(userData.birth_date);
    }
    
    if (userData.street_name !== undefined) {
      setParts.push(`street_name = $${paramIndex++}`);
      params.push(userData.street_name);
    }
    
    if (userData.street_number !== undefined) {
      setParts.push(`street_number = $${paramIndex++}`);
      params.push(userData.street_number);
    }
    
    if (userData.city_cap_id !== undefined) {
      setParts.push(`city_cap_id = $${paramIndex++}`);
      params.push(userData.city_cap_id);
    }
    
    if (userData.cap !== undefined) {
      setParts.push(`cap = $${paramIndex++}`);
      params.push(userData.cap);
    }
    
    if (userData.connected !== undefined) {
      setParts.push(`connected = $${paramIndex++}`);
      params.push(userData.connected);
    }
    
    // Always update updated_at
    setParts.push(`updated_at = NOW()`);
    
    // Add wa_id for WHERE clause
    params.push(wa_id);
    
    const query = `
      UPDATE candidates 
      SET ${setParts.join(', ')}
      WHERE wa_id = $${paramIndex}
      RETURNING *
    `;
    
    const candidate = await executeQuerySingle<CandidateData>(query, params);
    
    if (candidate) {
      const userData: UserData = {
        ...candidate,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        full_name: `${candidate.first_name} ${candidate.last_name}`.trim()
      };
      
      console.log(`✅ Updated candidate for wa_id: ${wa_id} (ID: ${userData.id})`);
      return userData;
    }
    
    throw new Error('Failed to update candidate');
  } catch (error) {
    console.error(`❌ Error updating candidate for wa_id ${wa_id}:`, error);
    throw error;
  }
}

/**
 * Update candidate last contact (set connected to true and update timestamp)
 */
export async function updateCandidateLastContact(wa_id: string): Promise<void> {
  try {
    const query = `
      UPDATE candidates 
      SET connected = true, updated_at = NOW() 
      WHERE wa_id = $1
    `;
    
    await executeQuery(query, [wa_id]);
  } catch (error) {
    console.error(`❌ Error updating candidate last contact for wa_id ${wa_id}:`, error);
    // Don't throw error for this non-critical operation
  }
}

/**
 * Save chat message to n8n_chat_histories table
 */
export async function saveChatMessage(
  session_id: string, 
  message: any
): Promise<ChatHistoryData | null> {
  try {
    const query = `
      INSERT INTO n8n_chat_histories (
        session_id, message
      ) VALUES (
        $1, $2
      ) RETURNING *
    `;
    
    const params = [
      session_id,
      JSON.stringify(message)
    ];
    
    const chatMessage = await executeQuerySingle<ChatHistoryData>(query, params);
    console.log(`💾 Saved chat message for session: ${session_id}`);
    
    return chatMessage;
  } catch (error) {
    console.error(`❌ Error saving chat message for session ${session_id}:`, error);
    throw error;
  }
}

/**
 * Get internal job by candidate ID and status
 */
export async function getInternalJobByStatus(candidate_id: string, status: string): Promise<JobData | null> {
  try {
    const query = `
      SELECT 
        id,
        created_at,
        candidate_id,
        type,
        status,
        step,
        job_offer_interested,
        job_offer_category
      FROM job 
      WHERE candidate_id = $1 AND status = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const job = await executeQuerySingle<JobData>(query, [candidate_id, status]);
    
    if (job) {
      console.log(`💼 Found ${status} job for candidate: ${candidate_id} (ID: ${job.id}, Type: ${job.type})`);
    } else {
      console.log(`💼 No ${status} job found for candidate: ${candidate_id}`);
    }
    
    return job;
  } catch (error) {
    console.error(`❌ Error fetching ${status} job for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Update internal job record
 */
export async function updateInternalJob(
  job_id: string, 
  updates: Partial<Pick<JobData, 'type' | 'status' | 'step' | 'job_offer_interested' | 'job_offer_category'>>
): Promise<JobData | null> {
  try {
    const setParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // Build dynamic update query
    if (updates.type !== undefined) {
      setParts.push(`type = $${paramIndex++}`);
      params.push(updates.type);
    }
    
    if (updates.status !== undefined) {
      setParts.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }
    
    if (updates.step !== undefined) {
      setParts.push(`step = $${paramIndex++}`);
      params.push(updates.step);
    }
    
    if (updates.job_offer_interested !== undefined) {
      setParts.push(`job_offer_interested = $${paramIndex++}`);
      params.push(updates.job_offer_interested);
    }
    
    if (updates.job_offer_category !== undefined) {
      setParts.push(`job_offer_category = $${paramIndex++}`);
      params.push(updates.job_offer_category);
    }
    
    if (setParts.length === 0) {
      throw new Error('No updates provided');
    }
    
    // Add job_id for WHERE clause
    params.push(job_id);
    
    const query = `
      UPDATE job 
      SET ${setParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const job = await executeQuerySingle<JobData>(query, params);
    
    if (job) {
      const logParts = [`✅ Updated internal job ID: ${job_id}`];
      if (updates.step !== undefined) logParts.push(`step: ${updates.step}`);
      if (updates.status !== undefined) logParts.push(`status: ${updates.status}`);
      if (updates.job_offer_interested !== undefined) logParts.push(`interested in: ${updates.job_offer_interested}`);
      if (updates.job_offer_category !== undefined) logParts.push(`category: ${updates.job_offer_category}`);
      console.log(logParts.join(', '));
      return job;
    }
    
    throw new Error('Failed to update internal job');
  } catch (error) {
    console.error(`❌ Error updating internal job ${job_id}:`, error);
    throw error;
  }
}

/**
 * Create internal job record
 */
export async function createInternalJob(
  candidate_id: string, 
  type: string, 
  step: number, 
  status: string = 'active', 
  job_offer_interested?: string,
  job_offer_category?: string
): Promise<JobData | null> {
  try {
    const query = `
      INSERT INTO job (
        candidate_id, type, status, step, job_offer_interested, job_offer_category
      ) VALUES (
        $1, $2, $3, $4, $5, $6
      ) RETURNING *
    `;
    
    const params = [
      candidate_id, 
      type, 
      status, 
      step, 
      job_offer_interested || null,
      job_offer_category || null
    ];
    
    const job = await executeQuerySingle<JobData>(query, params);
    
    if (job) {
      const logParts = [`✅ Created internal job for candidate: ${candidate_id}, type: ${type}, step: ${step}`];
      if (job_offer_interested) logParts.push(`interested in: ${job_offer_interested}`);
      if (job_offer_category) logParts.push(`category: ${job_offer_category}`);
      console.log(logParts.join(', '));
      return job;
    }
    
    throw new Error('Failed to create internal job');
  } catch (error) {
    console.error(`❌ Error creating internal job for candidate ${candidate_id}:`, error);
    throw error;
  }
}

/**
 * Get job offers by type
 */
export async function getJobOffersByType(type: string): Promise<JobOfferData[] | string> {
  try {
    const query = `
      SELECT 
        id,
        created_at,
        summary,
        link,
        title,
        type
      FROM job_offer 
      WHERE type = $1 
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const jobOffers = await executeQuery<JobOfferData>(query, [type]);
    console.log(`🔧 Found ${jobOffers.length} job offers for type: ${type}`);
    
    if (jobOffers.length === 0) {
      return `Non ci sono offerte di lavoro disponibili per ${type} al momento. 😔`;
    }
    
    // Format job offers as a nice message
    let message = `🔧 *Offerte di lavoro per ${type}:*\n\n`;
    
    jobOffers.forEach((offer, index) => {
      message += `*${index + 1}. ${offer.title || 'Titolo non disponibile'}*\n`;
      if (offer.summary) {
        message += `📝 ${offer.summary}\n`;
      }
      if (offer.link) {
        message += `🔗 Link: ${offer.link}\n`;
      }
      message += `📅 Pubblicato: ${offer.created_at.toLocaleDateString('it-IT')}\n\n`;
    });
    
    message += `_Trovate ${jobOffers.length} offerte per ${type}_`;
    
    return jobOffers;
  } catch (error) {
    console.error(`❌ Error fetching job offers for type ${type}:`, error);
    return `Si è verificato un errore durante la ricerca delle offerte di lavoro per ${type}. Riprova più tardi.`;
  }
}

// Legacy function for backward compatibility
export async function updateLastContact(wa_id: string): Promise<void> {
  return updateCandidateLastContact(wa_id);
}

/**
 * Reset all user data - delete chat history, jobs, appointments, and set connected to false
 */
export async function resetUserData(userId: string): Promise<boolean> {
  try {
    console.log(`🔄 Starting user data reset for: ${userId}`);

    // Delete chat history (always safe to try)
    try {
      await executeQuery(
        'DELETE FROM n8n_chat_histories WHERE session_id = $1',
        [userId]
      );
      console.log(`✅ Deleted chat history for user: ${userId}`);
    } catch (error) {
      console.log(`⚠️ Chat history table doesn't exist or error deleting: ${error}`);
    }

    // Delete jobs (using correct table name)
    try {
      await executeQuery(
        'DELETE FROM job WHERE candidate_id = $1',
        [userId]
      );
      console.log(`✅ Deleted jobs for user: ${userId}`);
    } catch (error) {
      console.log(`⚠️ Job table doesn't exist or error deleting: ${error}`);
    }

    // Delete appointments (using correct table name)
    try {
      await executeQuery(
        'DELETE FROM appointments WHERE candidate_id = $1',
        [userId]
      );
      console.log(`✅ Deleted appointments for user: ${userId}`);
    } catch (error) {
      console.log(`⚠️ Appointments table doesn't exist or error deleting: ${error}`);
    }

    // Set connected to false (this should always work since candidates table exists)
    try {
      await executeQuery(
        'UPDATE candidates SET connected = false WHERE id = $1',
        [userId]
      );
      console.log(`✅ Set connected=false for user: ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to update candidates table for user ${userId}:`, error);
      return false; // This is critical, if candidates table fails, consider reset failed
    }

    console.log(`🎯 User data reset completed successfully for: ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error resetting user data for ${userId}:`, error);
    return false;
  }
}
