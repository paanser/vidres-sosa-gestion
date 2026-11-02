"use strict";
(() => {
  const instances = new WeakMap();
  const colors = ["#17251e", "#b42318"];
  const limit = 5000;
  function clean(value) {
    let count = 0;
    const strokes = [];
    for (const stroke of Array.isArray(value?.strokes) ? value.strokes : []) {
      if (count >= limit) break;
      const points = (Array.isArray(stroke.points) ? stroke.points : []).slice(0, limit - count)
        .filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        .map(([x,y]) => [Math.max(0,Math.min(1000,x)), Math.max(0,Math.min(700,y))]);
      count += points.length;
      if (points.length) strokes.push({color:colors.includes(stroke.color)?stroke.color:colors[0],points});
    }
    return {strokes,notes:typeof value?.notes === "string" ? value.notes.slice(0,1000) : ""};
  }
  // Ajustes geométricos locales: no interpretan cifras ni cambian medidas.
  function straighten(points) {
    if(points.length<3)return null;
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const first=points[0],last=points.at(-1),span=distance(first,last);
    const length=points.slice(1).reduce((n,p,i)=>n+distance(points[i],p),0);
    if(span>=20&&length<=span*1.18){
      const deviation=Math.max(...points.map(p=>Math.abs((last[0]-first[0])*(first[1]-p[1])-(first[0]-p[0])*(last[1]-first[1]))/span));
      if(deviation<=Math.max(4,span*.08)){
        let end=[...last];
        if(Math.abs(last[1]-first[1])<=span*.12)end[1]=first[1];
        else if(Math.abs(last[0]-first[0])<=span*.12)end[0]=first[0];
        return {points:[first,end],label:"Línea enderezada"};
      }
    }
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
    if(points.length<8||w<20||h<20||span>Math.hypot(w,h)*.2||length<2*(w+h)*.75||length>2*(w+h)*1.4)return null;
    const tolerance=Math.max(5,Math.min(w,h)*.12),corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    if(!corners.every(c=>points.some(p=>distance(c,p)<=tolerance*1.4)))return null;
    if(points.filter(p=>Math.min(Math.abs(p[0]-x),Math.abs(p[0]-x-w),Math.abs(p[1]-y),Math.abs(p[1]-y-h))<=tolerance).length<points.length*.9)return null;
    // Mantener orientación y dimensiones aproximadas del dibujo original.
    return {points:[...corners,corners[0]],label:"Rectángulo ajustado"};
  }
  function smooth(points) {
    if(points.length<5)return null;
    return points.map((p,i)=>{
      if(i===0||i===points.length-1)return [...p];
      return [0,1].map(axis=>Math.round((points[i-1][axis]+2*p[axis]+points[i+1][axis])/4));
    });
  }
  function mount(host, initial) {
    host.replaceChildren();
    const details = document.createElement("details");
    details.className = "sketch-book";
    details.innerHTML = `<summary>✎ Dibujar medidas · Bloc de croquis</summary>
      <p>Dibuja medidas y formas con el dedo, lápiz táctil o ratón. Se guarda al guardar la pieza.</p>
      <div class="sketch-tools" role="group" aria-label="Herramientas del croquis">
        <button type="button" data-ink="#17251e" aria-pressed="true">Negro</button>
        <button type="button" data-ink="#b42318" aria-pressed="false">Rojo</button>
        <button type="button" data-sketch-undo>Deshacer</button>
        <button type="button" data-sketch-clear>Borrar dibujo</button>
      </div>
      <p>Mejora automática al levantar el dedo o lápiz: endereza líneas, ajusta rectángulos y suaviza los demás trazos. Dibuja el contorno de una vez. Deshacer recupera el trazo original. No interpreta letras ni medidas.</p>
      <canvas width="1000" height="700" aria-label="Hoja de croquis: dibuja con el dedo, lápiz o ratón"></canvas>
      <label>Notas del croquis<textarea maxlength="1000" rows="3" placeholder="Medidas, detalles de montaje o indicaciones…"></textarea></label>
      <p class="sketch-message" role="status" aria-live="polite"></p>`;
    host.appendChild(details);
    let state=clean(initial),ink=colors[0],active=null,pointer=null,history=[];
    const canvas=details.querySelector("canvas"),ctx=canvas.getContext("2d"),notes=details.querySelector("textarea"),message=details.querySelector(".sketch-message");
    notes.value=state.notes;
    if(state.strokes.length||state.notes)details.querySelector("summary").textContent="✎ Dibujar medidas · Con anotaciones";
    function draw(stroke) {
      ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=3;ctx.lineCap=ctx.lineJoin="round";
      const [first,...rest]=stroke.points;
      if (!first) return;
      if (!rest.length) {ctx.beginPath();ctx.arc(first[0],first[1],1.5,0,Math.PI*2);ctx.fill();return;}
      ctx.beginPath();ctx.moveTo(...first);for(const p of rest)ctx.lineTo(...p);ctx.stroke();
    }
    function remember(){history.push(structuredClone(state.strokes));if(history.length>20)history.shift();}
    function redraw(){ctx.clearRect(0,0,1000,700);state.strokes.forEach(draw);if(active)draw(active);details.querySelector("[data-sketch-undo]").disabled=!state.strokes.length&&!history.length;details.querySelector("[data-sketch-clear]").disabled=!state.strokes.length;}
    const point=e=>{const r=canvas.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1000,(e.clientX-r.left)*1000/r.width))),Math.round(Math.max(0,Math.min(700,(e.clientY-r.top)*700/r.height)))];};
    const count=()=>state.strokes.reduce((n,s)=>n+s.points.length,0)+(active?.points.length||0);
    canvas.addEventListener("pointerdown",e=>{
      if(pointer!==null||!e.isPrimary||e.button!==0)return;
      if(count()>=limit){message.textContent="Hoja llena. Deshaz algún trazo antes de seguir dibujando.";return;}
      e.preventDefault();pointer=e.pointerId;active={color:ink,points:[point(e)]};canvas.setPointerCapture(pointer);redraw();
    });
    canvas.addEventListener("pointermove",e=>{
      if(e.pointerId!==pointer||!active)return;e.preventDefault();
      const p=point(e),last=active.points.at(-1);
      if(count()<limit&&(p[0]!==last[0]||p[1]!==last[1])){active.points.push(p);redraw();}
      if(count()>=limit)message.textContent="Hoja llena. Puedes guardar o deshacer trazos.";
    });
    function finish(e){
      if(e.pointerId!==pointer)return;
      if(e.type==="pointerup"&&active){
        const end=point(e),last=active.points.at(-1);
        if(count()<limit&&(end[0]!==last[0]||end[1]!==last[1]))active.points.push(end);
        remember();state.strokes.push(active);
        const assisted=straighten(active.points),points=assisted?.points||smooth(active.points);
        if(points&&JSON.stringify(points)!==JSON.stringify(active.points)){
          // Deshacer primero restaura el trazo original, después permite quitarlo.
          remember();state.strokes[state.strokes.length-1]={...active,points};
          message.textContent=(assisted?.label||"Trazo suavizado automáticamente")+". Deshacer recupera el original.";
        }else message.textContent="Trazo conservado.";
      }
      active=null;pointer=null;redraw();
    }
    canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);canvas.addEventListener("lostpointercapture",finish);
    details.addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.ink){ink=b.dataset.ink;details.querySelectorAll("[data-ink]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));}
      if(b.hasAttribute("data-sketch-undo")){if(history.length)state.strokes=history.pop();else state.strokes.pop();message.textContent="Última acción deshecha.";redraw();}
      if(b.hasAttribute("data-sketch-clear")&&confirm("¿Borrar todos los trazos de este croquis? Las notas se conservarán.")){remember();state.strokes=[];message.textContent="Dibujo borrado. Guarda la pieza para confirmar el cambio.";redraw();}
    });
    redraw();
    const instance={
      read:()=>structuredClone({strokes:state.strokes,notes:notes.value.trim()}),
      open(){details.open=true;requestAnimationFrame(()=>canvas.scrollIntoView({block:"center"}));}
    };
    instances.set(host,instance);return instance;
  }
  window.vidresSketch={mount,open:host=>instances.get(host)?.open(),read:host=>instances.get(host)?.read()||{strokes:[],notes:""}};
})();
