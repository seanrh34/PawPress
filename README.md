# PawPress CMS

A modern, full-featured blog CMS built with Next.js 15, TypeScript, Lexical Editor, and Supabase.

## Features

- 📝 **Rich Text Editor**: Lexical-based editor with support for images, videos, code blocks, and more
- 🏷️ **Category System**: Organize posts with categories, each with its own dedicated page
- 🖼️ **Image Management**: Upload images to Supabase Storage with automatic optimization
- 📱 **Responsive Design**: Mobile-first design that works beautifully on all devices
- 🔒 **Admin Dashboard**: Secure admin area for managing posts and categories
- 🎨 **Clean URLs**: SEO-friendly URLs (`domain.com/[post-slug]` and `domain.com/category/[category-slug]`)
- 🚀 **Server Components**: Leveraging Next.js 15 App Router for optimal performance
- 🔍 **SEO Optimized**: Dynamic metadata generation for all pages

## Tech Stack

- **Framework**: Next.js 15.1.3 (App Router)
- **Language**: TypeScript
- **Editor**: Lexical
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS
- **Deployment**: Vercel-ready

## Prerequisites

- Node.js 18+ installed
- Supabase account and project
- npm or yarn

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

## Database Setup

Follow these steps in order to set up your Supabase database:

### 1. Create Categories Table

```sql
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster slug lookups
CREATE INDEX idx_categories_slug ON categories(slug);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to categories" ON categories
  FOR SELECT USING (true);

-- Allow authenticated users to insert/update/delete
CREATE POLICY "Allow authenticated write access to categories" ON categories
  FOR ALL USING (auth.role() = 'authenticated');
```

### 2. Create Posts Table

```sql
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_lexical JSONB,
  content_html TEXT,
  excerpt TEXT,
  featured_image_url TEXT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_published_at ON posts(published_at);
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Allow public to read published posts
CREATE POLICY "Allow public read access to published posts" ON posts
  FOR SELECT USING (published_at IS NOT NULL);

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated full access to posts" ON posts
  FOR ALL USING (auth.role() = 'authenticated');
```

### 3. Create Users Table (for admin authentication)

```sql
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('master', 'admin')),
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for email lookups
CREATE INDEX idx_users_email ON users(email);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read user data
CREATE POLICY "Allow authenticated read access to users" ON users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only authenticated users can update their own profile
CREATE POLICY "Allow users to update own profile" ON users
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Only master role can insert/delete users
CREATE POLICY "Allow master to manage users" ON users
  FOR ALL USING (auth.role() = 'authenticated');
```

### 4. Create Storage Bucket for Images

In the Supabase Dashboard, go to Storage and create a new bucket, or use SQL:

```sql
-- Create a public bucket for post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true);

-- Set up storage policies
CREATE POLICY "Allow public read access to post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');

CREATE POLICY "Allow authenticated users to upload images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'post-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete images"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-images' AND auth.role() = 'authenticated');
```

### 5. Create Default Category

```sql
INSERT INTO categories (name, slug, description)
VALUES ('Uncategorized', 'uncategorized', 'Posts that have not been categorized yet');
```

### 6. Create Your First Admin User

```sql
-- Replace 'your-email@example.com' and hash your password using bcrypt
-- You can use: https://bcrypt-generator.com/ with 10 rounds
INSERT INTO users (email, password_hash, role, display_name)
VALUES (
  'your-email@example.com',
  '$2a$10$YourHashedPasswordHere',
  'master',
  'Admin Name'
);
```

### 7. (Optional) Add Update Timestamp Triggers

```sql
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to posts table
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to categories table
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Set up your environment variables** (see above)

3. **Run the development server:**

```bash
npm run dev
```

4. **Open [http://localhost:3000](http://localhost:3000)** with your browser

5. **Access the admin dashboard** at [http://localhost:3000/admin](http://localhost:3000/admin)

## Project Structure

```
app/
├── [slug]/              # Dynamic post pages (domain.com/[slug])
├── admin/               # Admin dashboard
│   ├── category/        # Category management
│   └── posts/           # Post management (legacy)
├── api/                 # API routes
│   ├── category/        # Category CRUD endpoints
│   └── posts/           # Post CRUD endpoints
├── category/            # Category pages
│   ├── [slug]/          # Individual category pages
│   └── page.tsx         # Categories index
├── layout.tsx           # Root layout
└── page.tsx             # Homepage

components/
├── Editor.tsx           # Lexical rich text editor
├── PostCard.tsx         # Post card component (with category badge)
├── PostEditor.tsx       # Post creation/edit form
├── Header.tsx           # Site header with navigation
├── Footer.tsx           # Site footer
└── landing/             # Landing page sections

lib/
├── types.ts             # TypeScript interfaces
├── supabase.ts          # Supabase client
└── posts.ts             # Post-related utilities
```

## Key Features

### Category System

- **Category Management**: Full CRUD operations in `/admin/category`
- **Category Pages**: Browse posts by category at `/category/[slug]`
- **Category Badges**: Visual category indicators on post cards
- **Required Categories**: All new posts must be assigned to a category
- **Protected Deletion**: Cannot delete categories that have posts

### URL Structure

- Posts: `domain.com/[post-slug]`
- Categories: `domain.com/category/[category-slug]`
- Category Index: `domain.com/category`
- Admin: `domain.com/admin`

### Reserved Slugs

The following slugs are reserved and cannot be used for posts:
- `admin`
- `api`
- `category`
- `posts`
- `styles`

### Post Editor Features

- Rich text editing with Lexical
- Image uploads to Supabase Storage
- YouTube video embeds
- Code syntax highlighting
- Auto-slug generation from title
- Category selection (required)
- Featured image upload
- Excerpt editor
- Draft/Publish toggle

## API Routes

### Posts

- `GET /api/posts` - List all posts
- `POST /api/posts` - Create a new post
- `GET /api/posts/[id]` - Get a single post
- `PUT /api/posts/[id]` - Update a post
- `DELETE /api/posts/[id]` - Delete a post

### Categories

- `GET /api/category` - List all categories
- `POST /api/category` - Create a new category
- `GET /api/category/[id]` - Get a single category
- `PUT /api/category/[id]` - Update a category
- `DELETE /api/category/[id]` - Delete a category (blocked if posts exist)

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

### Environment Variables for Production

Ensure all environment variables are set in your hosting platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Sean Hardjanto (34cats)

Feel free to use this project for your own blog!
