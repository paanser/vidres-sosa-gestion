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
  function mount(host, initial) {
    host.replaceChildren();
    const details = document.createElement("details");
    details.className = "sketch-book";
    details.innerHTML = `<summary>✎ Bloc de croquis a mano</summary>
      <p>Dibuja medidas y formas con el dedo, lápiz táctil o ratón. Se guarda al guardar la pieza.</p>
      <div class="sketch-tools" role="group" aria-label="Herramientas del croquis">
        <button type="button" data-ink="#17251e" aria-pressed="true">Negro</button>
        <button type="button" data-ink="#b42318" aria-pressed="false">Rojo</button>
        <button type="button" data-sketch-undo>Deshacer</button>
        <button type="button" data-sketch-clear>Borrar dibujo</button>
      </div>
      <canvas width="1000" height="700" aria-label="Hoja de croquis: dibuja con el dedo, lápiz o ratón"></canvas>
      <label>Notas del croquis<textarea maxlength="1000" rows="3" placeholder="Medidas, detalles de montaje o indicaciones…"></textarea></label>
      <p class="sketch-message" role="status" aria-live="polite"></p>`;
    host.appendChild(details);
    let state=clean(initial),ink=colors[0],active=null,pointer=null;
    const canvas=details.querySelector("canvas"),ctx=canvas.getContext("2d"),notes=details.querySelector("textarea"),message=details.querySelector(".sketch-message");
    notes.value=state.notes;
    if(state.strokes.length||state.notes)details.querySelector("summary").textContent="✎ Bloc de croquis · Con anotaciones";
    function draw(stroke) {
      ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=3;ctx.lineCap=ctx.lineJoin="round";
      const [first,...rest]=stroke.points;
      if (!first) return;
      if (!rest.length) {ctx.beginPath();ctx.arc(first[0],first[1],1.5,0,Math.PI*2);ctx.fill();return;}
      ctx.beginPath();ctx.moveTo(...first);for(const p of rest)ctx.lineTo(...p);ctx.stroke();
    }
    function redraw(){ctx.clearRect(0,0,1000,700);state.strokes.forEach(draw);if(active)draw(active);details.querySelector("[data-sketch-undo]").disabled=!state.strokes.length;details.querySelector("[data-sketch-clear]").disabled=!state.strokes.length;}
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
    function finish(e){if(e.pointerId!==pointer)return;if(e.type!=="pointercancel"&&active)state.strokes.push(active);active=null;pointer=null;redraw();}
    canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);canvas.addEventListener("lostpointercapture",finish);
    details.addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.ink){ink=b.dataset.ink;details.querySelectorAll("[data-ink]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));}
      if(b.hasAttribute("data-sketch-undo")){state.strokes.pop();message.textContent="Último trazo deshecho.";redraw();}
      if(b.hasAttribute("data-sketch-clear")&&confirm("¿Borrar todos los trazos de este croquis? Las notas se conservarán.")){state.strokes=[];message.textContent="Dibujo borrado. Guarda la pieza para confirmar el cambio.";redraw();}
    });
    redraw();
    const instance={read:()=>structuredClone({strokes:state.strokes,notes:notes.value.trim()})};
    instances.set(host,instance);return instance;
  }
  window.vidresSketch={mount,read:host=>instances.get(host)?.read()||{strokes:[],notes:""}};
})();
