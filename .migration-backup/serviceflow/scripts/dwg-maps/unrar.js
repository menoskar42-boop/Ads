const {createExtractorFromData}=require('node-unrar-js');const fs=require('fs'),path=require('path');
(async()=>{const [src,out]=process.argv.slice(2);const data=Uint8Array.from(fs.readFileSync(src)).buffer;
const ex=await createExtractorFromData({data});const {files}=ex.extract();
for(const f of files){const n=f.fileHeader.name;if(f.fileHeader.flags.directory)continue;const p=path.join(out,n.replace(/\\/g,'/'));
if(!p.startsWith(out))continue;fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,f.extraction);console.log(n,f.fileHeader.unpSize);}})();
