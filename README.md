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
- 🤖 **CLI & AI agents**: Token-authenticated API and a `pawpress` CLI for managing content from the terminal or an AI agent

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
# Signs CLI/API personal access tokens. At least 32 random bytes, e.g. `openssl rand -base64 48`.
# Optional: without it, the CLI/API token auth is disabled (the web admin still works).
PAWPRESS_TOKEN_SECRET=your_random_secret
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

### 3. Admin Users (Supabase Auth + `user_profiles`)

Admins sign in with **Supabase Auth** (email + password); there is no password table in the app
database. Each admin also needs a row in a `user_profiles` table, which holds their role:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, the Supabase Auth user id (`auth.users.id`) |
| `email` | text | |
| `role` | text | `master` or `admin` |
| `created_by` | uuid | the master who created the account (nullable) |
| `created_at`, `updated_at` | timestamptz | |

Display names are stored in the Auth user's `user_metadata.display_name`. Login is refused for Auth
users without a profile row. The `master` account can create and delete admins from `/admin/users`
(via the Supabase Admin API, which needs `SUPABASE_SECRET_KEY`).

Enable RLS on `user_profiles` so profiles are only readable by authenticated users. See
[`docs/SUPABASE_FOLLOWUPS.md`](docs/SUPABASE_FOLLOWUPS.md) for recommended role-aware policies.

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

1. In the Supabase Dashboard, go to **Authentication → Users → Add user** and create a user with an
   email and password (auto-confirm it).
2. Insert their profile with the `master` role, using the new user's id:

```sql
INSERT INTO user_profiles (id, email, role)
VALUES ('<auth-user-uuid>', 'your-email@example.com', 'master');
```

3. Disable public sign-ups (**Authentication → Sign In / Providers**). Further admins are created from `/admin/users`.

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

The following slugs are reserved and cannot be used for posts or categories:
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

### API v1 (token-authenticated, used by the CLI)

`/api/v1/*` uses personal access tokens with scopes instead of the browser session. See
[`docs/cli-api.md`](docs/cli-api.md) for the full contract.

## CLI & AI agents

The `pawpress` CLI (in [`cli/`](cli/)) lets you and your AI agents manage posts, categories, and
images from the terminal, using Markdown files with front matter.

1. Set `PAWPRESS_TOKEN_SECRET` on the server.
2. Create a token at `/admin/tokens`. For agents, `posts:read`, `posts:write`, and `media:upload` let
   them write drafts that a human publishes.
3. `cd cli && npm install && npm run build && npm link`
4. `printf '%s' "$TOKEN" | pawpress auth login --url https://your-site.example`

```sh
pawpress posts pull my-post -o my-post.md
pawpress posts push my-post.md --write-back
```

See [`docs/cli.md`](docs/cli.md) for the setup guide, agent instructions, and exit codes.

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
- `PAWPRESS_TOKEN_SECRET` (needed for the CLI/API; set it separately for Preview and Production)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Sean Hardjanto (34cats)

Feel free to use this project for your own blog!
