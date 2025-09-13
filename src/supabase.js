import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not configured. Please check your .env file.');
}

// Create a lazy supabase client that only initializes when needed
let _supabase = null;
export const getSupabaseClient = () => {
  if (!_supabase && supabaseUrl && supabaseAnonKey) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
};

// For backward compatibility
export const supabase = getSupabaseClient();

// Helper function to upload image to Supabase Storage
export const uploadImageToSupabase = async (file) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }
  
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `uploads/${fileName}`

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('uploadopenai')
      .upload(filePath, file)

    if (uploadError) {
      throw uploadError
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabaseClient.storage
      .from('uploadopenai')
      .getPublicUrl(filePath)

    return {
      filePath: uploadData.path,
      publicUrl: urlData.publicUrl
    }
  } catch (error) {
    console.error('Error uploading image:', error)
    throw error
  }
}

// Helper function to save image data to database
export const saveImageToDatabase = async (imageUrl, fileName = null) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('uploadpricing2')
      .insert([
        {
          photo: imageUrl,
          filename: fileName || 'uploaded_image',
          uploaded_at: new Date().toISOString()
        }
      ])
      .select()

    if (error) {
      throw error
    }

    return data[0]
  } catch (error) {
    console.error('Error saving to database:', error)
    throw error
  }
}