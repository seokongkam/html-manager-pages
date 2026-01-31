// ----------------------
// Config
// ----------------------
const USERNAME = "admin";
const PASSWORD = "Hokibanget8899@@";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_HOSTNAMES = ["bolabaru.click","bolabaruclick.pages.dev"];

// ----------------------
// Helpers
// ----------------------
function isMainDomain(hostname) { return ALLOWED_HOSTNAMES.includes(hostname); }

function checkAuth(request) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  const decoded = atob(auth.split(" ")[1]);
  const [user, pass] = decoded.split(":");
  return user === USERNAME && pass === PASSWORD;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9\-_\.]/g, "_");
}

function subdomainName(filename) {
  return sanitizeFilename(filename.replace(/\.html$/, "")).substring(0, 50);
}

function backupFilename(filename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g,"-");
  return `${filename}.backup-${timestamp}`;
}

async function cleanupBackups(filename) {
  const list = await HTML_PAGES.list({ prefix: filename + ".backup-" });
  const backups = list.keys.sort((a, b) => a.name.localeCompare(b.name));
  while (backups.length >= 2) {
    const oldest = backups.shift();
    await HTML_PAGES.delete(oldest.name);
  }
}

// ----------------------
// CSS
// ----------------------
function getCSS() {
  return `
<style>
:root{--primary:#1e40af;--primary-hover:#3b82f6;--bg:#f4f7fa;--bg-card:#fff;--text:#333;}
@media(prefers-color-scheme:dark){:root{--bg:#111827;--bg-card:#1f2937;--text:#f4f4f5;}}
body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);margin:0;padding:20px;}
h2{color:var(--primary);}a{color:var(--primary);text-decoration:none;}a:hover{text-decoration:underline;}
button{background-color:var(--primary);color:#fff;border:none;padding:8px 16px;cursor:pointer;border-radius:5px;transition:0.3s;}
button:hover{background-color:var(--primary-hover);}
form{background:var(--bg-card);padding:20px;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.1);max-width:800px;margin-bottom:20px;}
input[type="file"],textarea{width:100%;margin-bottom:10px;padding:8px;border-radius:5px;border:1px solid #ccc;box-sizing:border-box;background:var(--bg-card);color:var(--text);}
textarea{font-family:monospace;}
ul{list-style:none;padding-left:0;}
li{background:var(--bg-card);margin-bottom:10px;padding:10px 15px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.05);display:flex;justify-content:space-between;align-items:center;}
li a{margin-left:10px;}
.footer-links{margin-top:15px;}
</style>`;
}

// ----------------------
// 404 Page
// ----------------------
function render404(hostname){
  return new Response(`
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>404 Not Found</title></head><body>
<h1>404 - Page Not Found</h1>
<p>Go back <a href="https://bolabaru.click/">home</a></p>
</body></html>
`, {status:404, headers:{"Content-Type":"text/html"}});
}

// ----------------------
// Main handler
// ----------------------
async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const subdomain = hostname.split('.')[0];
  const protectedPaths = ["/upload.html","/upload","/edit.html","/edit-file.html","/delete-file.html","/restore.html"];

  // Auth
  if(protectedPaths.includes(url.pathname) && !isMainDomain(hostname)){
    return new Response("Forbidden: Access only allowed from main domain",{status:403});
  }
  if(protectedPaths.includes(url.pathname) && !checkAuth(request)){
    return new Response("Unauthorized",{status:401, headers:{"WWW-Authenticate":'Basic realm="HTML Manager"'}});
  }

  // ----------------------
  // Upload Page
  // ----------------------
  if(url.pathname==="/upload.html"){
    return new Response(`<h2>Upload HTML</h2>
<form action="/upload" method="POST" enctype="multipart/form-data">
<input type="file" name="file" accept=".html">
<button>Upload</button>
</form>
<div class="footer-links">
<a href="/amp/">View Index</a> | <a href="/edit.html">Edit Files</a> | <a href="/restore.html">Restore Backup</a>
</div>
${getCSS()}`, {headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Process Upload
  // ----------------------
  if(url.pathname==="/upload" && request.method==="POST"){
    const formData = await request.formData();
    const file = formData.get("file");
    if(!file) return new Response("No file uploaded",{status:400});
    if(file.size > MAX_FILE_SIZE) return new Response("File too large",{status:400});

    let filename = sanitizeFilename(file.name);
    if(!filename.endsWith(".html")) filename += ".html";

    const existing = await HTML_PAGES.get(filename);
    if(existing){
      await cleanupBackups(filename);
      await HTML_PAGES.put(backupFilename(filename), existing);
    }

    const content = await file.text();
    await HTML_PAGES.put(filename, content);

    const sub = subdomainName(filename);
    return new Response(`<h2>File uploaded: ${filename}</h2>
<div class="footer-links">
<a href="/amp/${filename}">View /amp/</a><br>
<a href="https://${sub}.bolabaru.click">View Subdomain</a><br>
<a href="/edit.html">Edit Files</a> | <a href="/restore.html">Restore Backup</a>
</div>${getCSS()}`,{headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Edit Page
  // ----------------------
  if(url.pathname==="/edit.html"){
    const list = await HTML_PAGES.list({prefix:""});
    let html = `<h2>Edit HTML Files</h2><ul>`;
    for(const key of list.keys){
      if(!key.name.includes(".backup-")){
        html += `<li>${key.name} | <a href="/edit-file.html?file=${encodeURIComponent(key.name)}">Edit</a> | <a href="/delete-file.html?file=${encodeURIComponent(key.name)}">Delete</a></li>`;
      }
    }
    html += `</ul><div class="footer-links"><a href="/upload.html">Upload New HTML</a> | <a href="/amp/">View /amp/</a> | <a href="/restore.html">Restore Backup</a></div>${getCSS()}`;
    return new Response(html,{headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Edit File Form
  // ----------------------
  if(url.pathname==="/edit-file.html" && request.method==="GET"){
    const filename = sanitizeFilename(url.searchParams.get("file")||"");
    if(!filename) return new Response("File not specified",{status:400});
    const content = await HTML_PAGES.get(filename);
    if(!content) return new Response("File not found",{status:404});

    return new Response(`<h2>Editing: ${filename}</h2>
<form action="/edit-file.html?file=${encodeURIComponent(filename)}" method="POST">
<textarea name="content" rows="20" cols="80">${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea><br>
<button>Save</button>
</form>
<div class="footer-links"><a href="/edit.html">Back to list</a></div>
${getCSS()}`, {headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Process Edit
  // ----------------------
  if(url.pathname==="/edit-file.html" && request.method==="POST"){
    const filename = sanitizeFilename(url.searchParams.get("file")||"");
    if(!filename) return new Response("File not specified",{status:400});
    const formData = await request.formData();
    const content = formData.get("content");
    if(!content) return new Response("Content is empty",{status:400});

    const existing = await HTML_PAGES.get(filename);
    if(existing){
      await cleanupBackups(filename);
      await HTML_PAGES.put(backupFilename(filename), existing);
    }
    await HTML_PAGES.put(filename, content);
    const sub = subdomainName(filename);
    return new Response(`<h2>File saved: ${filename}</h2>
<div class="footer-links">
<a href="/edit.html">Back to list</a><br>
<a href="/amp/${filename}">View /amp/</a><br>
<a href="https://${sub}.bolabaru.click">View Subdomain</a>
</div>${getCSS()}`, {headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Delete File
  // ----------------------
  if(url.pathname==="/delete-file.html"){
    const filename = sanitizeFilename(url.searchParams.get("file")||"");
    if(!filename) return new Response("File not specified",{status:400});
    const content = await HTML_PAGES.get(filename);
    if(!content) return new Response("File not found",{status:404});

    await cleanupBackups(filename);
    await HTML_PAGES.put(backupFilename(filename), content);
    await HTML_PAGES.delete(filename);

    return new Response(`<h2>File deleted: ${filename}</h2>
<div class="footer-links"><a href="/edit.html">Back to list</a> | <a href="/restore.html">Restore Backup</a></div>${getCSS()}`,{headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // Restore Backup
  // ----------------------
  if(url.pathname==="/restore.html"){
    const list = await HTML_PAGES.list({prefix:""});
    let html = `<h2>Restore Backup</h2><ul>`;
    for(const key of list.keys){
      if(key.name.includes(".backup-")){
        html += `<li>${key.name} | <a href="/restore.html?file=${encodeURIComponent(key.name)}&action=restore">Restore</a></li>`;
      }
    }
    html += `</ul><div class="footer-links"><a href="/edit.html">Back to list</a> | <a href="/upload.html">Upload New HTML</a></div>${getCSS()}`;

    const restoreFile = url.searchParams.get("file");
    const action = url.searchParams.get("action");
    if(restoreFile && action==="restore"){
      const backupContent = await HTML_PAGES.get(restoreFile);
      if(!backupContent) return new Response("Backup not found",{status:404});
      const original = restoreFile.replace(/\.backup-.*$/,"");
      await HTML_PAGES.put(original, backupContent);
      return new Response(`<h2>Restored: ${original}</h2>
<div class="footer-links"><a href="/restore.html">Back to Restore List</a> | <a href="/edit.html">Edit Files</a></div>${getCSS()}`, {headers:{"Content-Type":"text/html"}});
    }

    return new Response(html,{headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // AMP Index
  // ----------------------
  if(url.pathname==="/amp" || url.pathname==="/amp/"){
    const list = await HTML_PAGES.list({prefix:""});
    let htmlList = `<h2>Uploaded HTML Files</h2><ul>`;
    for(const key of list.keys){
      if(!key.name.includes(".backup-")){
        const sub = subdomainName(key.name);
        htmlList += `<li><a href="/amp/${key.name}">${key.name}</a> | <a href="https://${sub}.bolabaru.click" target="_blank">Subdomain</a></li>`;
      }
    }
    htmlList += `</ul>`;
    return new Response(`${getCSS()}${htmlList}`, {headers:{"Content-Type":"text/html"}});
  }

  // ----------------------
  // AMP File
  // ----------------------
  if(url.pathname.startsWith("/amp/") && url.pathname !== "/amp/"){
    const filename = sanitizeFilename(url.pathname.split("/amp/")[1]);
    const html = await HTML_PAGES.get(filename);
    if(!html) return render404(hostname);

    return new Response(html, {headers:{"Content-Type":"text/html","Cache-Control":"public, max-age=300"}});
  }

  // ----------------------
  // Subdomain Access
  // ----------------------
  if(hostname.endsWith("bolabaru.click") && hostname !== "bolabaru.click"){
    const filename = sanitizeFilename(subdomain + ".html");
    const html = await HTML_PAGES.get(filename);
    if(!html) return render404(hostname);
    return new Response(html, {headers:{"Content-Type":"text/html","Cache-Control":"public, max-age=300"}});
  }

  // ----------------------
  // Fallback 404
  // ----------------------
  return render404(hostname);
}

// ----------------------
// Event listener
// ----------------------
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
