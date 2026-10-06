(function(){
  try{
    if(!window.Capacitor||!(Capacitor.isNativePlatform&&Capacitor.isNativePlatform()))return;
    function call(plugin,method,opts){
      if(Capacitor.nativePromise)return Capacitor.nativePromise(plugin,method,opts);
      return Capacitor.Plugins[plugin][method](opts);
    }
    function toB64(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result).split(",")[1]||"")};r.onerror=rej;r.readAsDataURL(blob)})}
    document.addEventListener("click",function(e){
      var a=e.target&&e.target.closest?e.target.closest("a[download]"):null;
      if(!a)return;var href=a.getAttribute("href")||"";
      if(href.indexOf("blob:")!==0)return;
      e.preventDefault();e.stopImmediatePropagation();
      var name=(a.getAttribute("download")||"file").replace(/[\\/:*?"<>|]/g,"_");
      fetch(href).then(function(r){return r.blob()}).then(toB64).then(function(b64){
        return call("Filesystem","writeFile",{path:"STFFE/"+name,data:b64,directory:"DOCUMENTS",recursive:true});
      }).then(function(){alert("✅ Save ஆனது: Documents/STFFE/"+name)}).catch(function(err){alert("❌ Save ஆகவில்லை: "+(err&&err.message||err))});
    },true);
  }catch(e){console.warn("cap-shim",e)}
})();
