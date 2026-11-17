# Blockhaven

A Minecraft-style voxel sandbox that runs in the browser: one HTML page, three dimensions, survival and creative modes, and shared multiplayer.

- `index.html` is the whole game.
- `supabase-adapter.js` connects multiplayer to Supabase (shared world + live player sync).
- `config.js` holds your Supabase project URL and public key.
- `supabase/setup.sql` creates the one table the game needs.
- `manifest.json`, `sw.js`, `icon.svg` make the game installable as an app.

Without Supabase configured, the game still runs in single-player.

## Host it: step by step

### 1. Supabase (the multiplayer backend)
1. Go to https://supabase.com, sign in, and create a **New project**. Wait for it to finish setting up.
2. Open **SQL Editor**, paste the whole of `supabase/setup.sql`, and press **Run**.
3. Open **Project Settings -> API** and copy two values: the **Project URL** and the **anon public** key.
   Do not use the `service_role` key.
4. Open `config.js` and paste them in place of `https://YOUR-PROJECT.supabase.co` and `YOUR-ANON-KEY`.

### 2. GitHub (where the files live)
1. Create a new repository on https://github.com (private is fine).
2. Upload every file in this folder, keeping `supabase/setup.sql` inside its `supabase` folder.
   From a terminal: `git remote add origin https://github.com/<you>/<repo>.git` then `git push -u origin main`.

### 3. Vercel (the public address)
1. Go to https://vercel.com, choose **Add New -> Project**, and import the GitHub repository.
2. Framework preset: **Other**. Leave the build command and output directory empty. Press **Deploy**.
3. Vercel gives you an address like `https://your-project.vercel.app`. That is the game.

Every later push to GitHub redeploys automatically.

### 4. Invite people
- Send the Vercel address. Nobody needs an account.
- Everyone on the same address plays in the same world. Add `?world=name` to the address for a separate world,
  for example `https://your-project.vercel.app/?world=friends`.
- On a phone, use the browser's **Add to Home Screen** to install it as an app.

## How ownership works here
- The first browser to open a world becomes its owner; that is remembered in that browser only.
- Resetting the shared world needs the owner's browser and the reset password, as in the Claude version.
- Everyone who has the link can build. The public key allows anyone with it to read and write the world table,
  so only share the address with people you trust, or add Supabase Auth and stricter table policies later.

## Limits to know about
- Supabase's free tier caps realtime messages and connections; check your project's Realtime quotas if many people play at once.
- The Supabase adapter was written against the same interface the game uses inside Claude, but it has not yet been run against a live Supabase project.
