import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Configuration validation
const validateSupabaseConfig = () => {
  const errors = [];
  
  if (!supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is missing');
  } else if (!supabaseUrl.startsWith('https://')) {
    errors.push('VITE_SUPABASE_URL must be a valid HTTPS URL');
  }
  
  if (!supabaseAnonKey) {
    errors.push('VITE_SUPABASE_ANON_KEY is missing');
  } else if (supabaseAnonKey.length < 100) {
    errors.push('VITE_SUPABASE_ANON_KEY appears to be invalid (too short)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const configValidation = validateSupabaseConfig();

if (!configValidation.isValid) {
  console.warn('Supabase configuration issues detected:', configValidation.errors);
}

// Create a lazy supabase client that only initializes when needed
let _supabase = null;
export const getSupabaseClient = () => {
  if (!_supabase && configValidation.isValid) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
};

// Configuration health check
export const getSupabaseHealth = () => {
  return {
    ...configValidation,
    hasClient: !!_supabase,
    url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'Missing'
  };
};

// For backward compatibility
export const supabase = getSupabaseClient();

// Helper function to upload image to Supabase Storage
export const uploadImageToSupabase = async (file) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    const healthCheck = getSupabaseHealth();
    throw new Error(`Supabase is not configured properly. Issues: ${healthCheck.errors.join(', ')}. Please check your environment variables.`);
  }
  
  try {
    // Safe file name handling with null checks
    const fileName = file.name || 'image';
    const fileExt = fileName && typeof fileName === 'string' ? 
      (fileName.split('.').pop() || 'jpg') : 'jpg';
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `uploads/${uniqueFileName}`;

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

// Helper function to listen for database updates on a specific row
export const listenForPricingUpdates = (rowid, onUpdate) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    const healthCheck = getSupabaseHealth();
    console.error('Supabase configuration issues:', healthCheck.errors);
    return null;
  }
  
  const channel = supabaseClient
    .channel(`pricing-watch-${rowid}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'uploadpricing2',
        filter: `rowid=eq.${rowid}`
      },
      (payload) => {
        console.log('Pricing update received:', payload);
        // Check for priceaddon update (matching Shopify logic)
        if (payload.new && payload.new.priceaddon !== null && payload.new.priceaddon !== undefined) {
          onUpdate(payload.new);
        }
      }
    )
    .subscribe();
    
  return channel;
};

// Helper function to fetch updated pricing data
export const fetchPricingData = async (rowid) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    const healthCheck = getSupabaseHealth();
    throw new Error(`Supabase is not configured properly. Issues: ${healthCheck.errors.join(', ')}. Please check your environment variables.`);
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('uploadpricing2')
      .select('rowid, image, priceaddon, infoaddon, type, thickness, keyword')
      .eq('rowid', rowid)
      .single();
      
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    throw error;
  }
};

// Helper function to cleanup realtime subscriptions
export const cleanupChannel = (channel) => {
  if (channel) {
    const supabaseClient = getSupabaseClient();
    if (supabaseClient) {
      supabaseClient.removeChannel(channel);
    }
  }
};

// Helper function to save image data to database
export const saveImageToDatabase = async (imageUrl, fileName = null) => {
  const supabaseClient = getSupabaseClient();
  
  if (!supabaseClient) {
    const healthCheck = getSupabaseHealth();
    throw new Error(`Supabase is not configured properly. Issues: ${healthCheck.errors.join(', ')}. Please check your environment variables.`);
  }
  
  try {
    // Generate UUID for rowid (matching Shopify implementation)
    const rowid = crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8); 
        return v.toString(16);
      });
    
    // Safe filename handling
    const safeName = fileName && typeof fileName === 'string' ? fileName : 'uploaded_image';
    
    const { data, error } = await supabaseClient
      .from('uploadpricing2')
      .insert([
        {
          rowid: rowid,
          image: imageUrl,
          // Store original filename if available
          keyword: safeName
        }
      ])
      .select()

    if (error) {
      throw error
    }

    // Return data with the generated rowid as id for compatibility
    const result = data[0];
    return {
      ...result,
      id: result.rowid  // Provide id alias for compatibility
    };
  } catch (error) {
    console.error('Error saving to database:', error)
    throw error
  }
}