(function(){
  try{
    if(!window.Capacitor||!(Capacitor.isNativePlatform&&Capacitor.isNativePlatform()))return;
    function call(plugin,method,opts){
      if(Capacitor.nativePromise)return Capacitor.nativePromise(plugin,method,opts);
      return Capacitor.Plugins[plugin][method](opts);
    }
    function toB64(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result).split(",")[1]||"")};r.onerror=rej;r.readAsDataURL(blob)})}
    function toast(msg,bad){
      try{
        var t=document.createElement("div");
        t.textContent=msg;
        t.style.cssText="position:fixed;left:8px;right:8px;bottom:70px;z-index:2147483647;padding:10px 12px;border-radius:8px;font:14px sans-serif;color:#fff;background:"+(bad?"#b00020":"#1b5e20")+";box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none";
        document.body.appendChild(t);
        setTimeout(function(){try{t.remove()}catch(e){}},bad?6000:2500);
      }catch(e){}
    }
    // 1) Downloads/STFFE  2) Documents/STFFE  3) Share sheet (Save to Drive / WhatsApp / Files)
    function saveFile(name,b64){
      return call("Filesystem","writeFile",{path:"Download/STFFE/"+name,data:b64,directory:"EXTERNAL_STORAGE",recursive:true})
        .then(function(){return "Downloads/STFFE/"+name})
        .catch(function(){
          return call("Filesystem","writeFile",{path:"STFFE/"+name,data:b64,directory:"DOCUMENTS",recursive:true})
            .then(function(){return "Documents/STFFE/"+name});
        })
        .catch(function(){
          return call("Filesystem","writeFile",{path:"STFFE_share/"+name,data:b64,directory:"CACHE",recursive:true})
            .then(function(r){return call("Share","share",{title:name,files:[r.uri],dialogTitle:"Save: "+name})})
            .then(function(){return "Share sheet: "+name});
        });
    }
    var chain=Promise.resolve();
    document.addEventListener("click",function(e){
      var a=e.target&&e.target.closest?e.target.closest("a[download]"):null;
      if(!a)return;var href=a.getAttribute("href")||"";
      if(href.indexOf("blob:")!==0&&href.indexOf("data:")!==0)return;
      e.preventDefault();e.stopImmediatePropagation();
      var name=(a.getAttribute("download")||"file").replace(/[\\/:*?"<>|]/g,"_");
      // files are saved one after another so many downloads (Full Backup All) do not clash
      chain=chain.then(function(){
        return fetch(href).then(function(r){return r.blob()}).then(toB64).then(function(b64){return saveFile(name,b64)})
          .then(function(where){toast("✅ Save ஆனது: "+where)})
          .catch(function(err){toast("❌ Save ஆகவில்லை: "+name+" — "+(err&&err.message||err),true)});
      });
    },true);
  }catch(e){console.warn("cap-shim",e)}
})();
