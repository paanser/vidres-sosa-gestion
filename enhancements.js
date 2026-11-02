"use strict";
(() => {
 const count=document.querySelector("#ai-usage-count");
 function renderUsage(){
  const month=new Date().toISOString().slice(0,7);
  const n=Number(localStorage.getItem("vidres-ai-success-"+month)||0);
  count.textContent="Consultas con IA completadas este mes en este dispositivo: "+n;
 }
 renderUsage();window.addEventListener("vidres-ai-usage",renderUsage);
 const get=document.querySelector("#location-get"),map=document.querySelector("#location-map");
 const status=document.querySelector("#location-message"),field=document.querySelector('#form [name="direccion"]');
 let coords=null;
 get.addEventListener("click",()=>{
  if(!navigator.geolocation){status.textContent="Tu navegador no permite obtener la ubicación.";return;}
  status.textContent="Solicitando permiso de ubicación…";
  get.disabled=true;
  navigator.geolocation.getCurrentPosition(async pos=>{
   const lat=pos.coords.latitude,lon=pos.coords.longitude;coords={lat,lon};
   map.disabled=false;
   status.textContent="Ubicación obtenida. Buscando una dirección aproximada…";
   try{
    const url="https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lon)+"&zoom=18&addressdetails=1";
    const r=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!r.ok)throw Error("No disponible");
    const data=await r.json(),a=data.address||{};
    const street=[a.road||a.pedestrian||a.footway||"",a.house_number||""].filter(Boolean).join(" ");
    const locality=a.city||a.town||a.village||a.municipality||"";
    const address=[street,locality].filter(Boolean).join(", ");
    if(address && (!field.value.trim() || confirm("¿Sustituir la dirección actual por la aproximada obtenida del mapa?"))){field.value=address.slice(0,field.maxLength);}
    status.textContent="Dirección aproximada obtenida de OpenStreetMap. Comprueba calle y número antes de guardar.";
   }catch{status.textContent="Ubicación detectada, pero no se pudo obtener la dirección. Puedes abrir el mapa y escribirla manualmente.";}
   finally{get.disabled=false;}
  },err=>{get.disabled=false;status.textContent=err.code===1?"No se ha autorizado la ubicación. Puedes escribir la dirección manualmente.":"No se pudo obtener la ubicación. Inténtalo de nuevo.";},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
 });
 map.addEventListener("click",()=>{
  const address=field.value.trim();
  const url=coords?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(coords.lat+","+coords.lon):address?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(address):"";
  if(!url){status.textContent="Primero introduce una dirección o pulsa Usar mi ubicación.";return;}
  window.open(url,"_blank","noopener,noreferrer");
 });
 document.querySelector("#editor").addEventListener("close",()=>{coords=null;status.textContent="La ubicación solo se solicita cuando pulses el botón.";});
})();