# Cake Genie 🎂

A mobile-first React application for finding cake designs and getting AI-powered pricing with Supabase integration.

## Features

- 📱 Mobile-first responsive design
- 🔍 Google Custom Search integration for cake images
- 📤 Image upload with Supabase Storage
- 🗄️ Database integration for storing uploaded images
- 💰 AI-powered pricing simulation
- ⌨️ Full keyboard shortcut support (Ctrl+C, Ctrl+V, Ctrl+A)

## Tech Stack

- **Frontend**: React 19+ with Vite
- **Styling**: Tailwind CSS v3.4.0
- **Backend**: Supabase (Storage + Database)
- **Search**: Google Custom Search Engine
- **Deployment**: Vercel

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/apcaballes87/cake-genie.git
cd cake-genie
npm install
```

### 2. Supabase Configuration

1. Create a new project at [Supabase](https://supabase.com)
2. Create a storage bucket named `uploadopenai`
3. Create a table named `uploadpricing2` with the following columns:
   - `id` (int8, primary key, auto-increment)
   - `photo` (text) - for storing image URLs
   - `filename` (text) - for storing original filenames
   - `uploaded_at` (timestamptz) - for tracking upload time
   - `created_at` (timestamptz, default: now())

4. Set up your environment variables:

```bash
cp .env.example .env
```

Then edit `.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Database Schema

Run this SQL in your Supabase SQL editor:

```sql
-- Create the uploadpricing2 table
CREATE TABLE uploadpricing2 (
  id BIGSERIAL PRIMARY KEY,
  photo TEXT NOT NULL,
  filename TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE uploadpricing2 ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow inserts (adjust as needed for your use case)
CREATE POLICY "Allow public inserts" ON uploadpricing2
  FOR INSERT WITH CHECK (true);
```

### 4. Storage Setup

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `uploadopenai`
3. Set it to public if you want direct access to images
4. Configure upload policies as needed

### 5. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Features in Detail

### Image Upload Flow

1. User selects/drops an image file
2. Image is validated (size, dimensions, file type)
3. Image is uploaded to Supabase Storage (`uploadopenai` bucket)
4. Image URL and metadata are saved to `uploadpricing2` table
5. User sees confirmation and can proceed with pricing

### Mobile-First Design

- **Mobile (< 768px)**: Stacked layout with search bar and upload button in separate rows
- **Desktop (≥ 768px)**: Horizontal layout with search and upload in the same row
- **Touch targets**: Minimum 44x44px for better mobile interaction

### Keyboard Shortcuts

- **Ctrl+A** / **Cmd+A**: Select all text in search bar
- **Ctrl+C** / **Cmd+C**: Copy selected text
- **Ctrl+V** / **Cmd+V**: Paste text
- **Enter**: Trigger search

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |

## Deployment

The project is configured for Vercel deployment:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## Project Structure

```
src/
├── App.jsx          # Main application component
├── supabase.js      # Supabase client and helper functions
├── main.jsx         # React entry point
└── index.css        # Global styles and Tailwind imports
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License