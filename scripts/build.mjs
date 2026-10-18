import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('public',{recursive:true});
// Explicit public allowlist: never publish server sources, tests or environment files.
for(const file of ['index.html','recipe-api.js','recipe.html','recipes.html','recipes.json','robots.txt','sitemap.xml','direct-contact.js','direct-contact-config.js']) await copyFile(file,`public/${file}`);
await cp('assets','public/assets',{recursive:true});
