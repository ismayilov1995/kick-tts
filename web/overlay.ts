const cap = document.getElementById('cap')!;
let audio: HTMLAudioElement | null = null;

function connect(): void {
  const ws = new WebSocket(`ws://${location.host}/ws?role=overlay`);
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.type === 'play') {
      audio?.pause();
      const a = new Audio(msg.url);
      audio = a;
      let sent = false;
      let timer = setTimeout(() => done(), 15_000);
      const done = () => {
        if (sent) return;
        sent = true;
        clearTimeout(timer);
        cap.style.display = 'none';
        ws.send(JSON.stringify({ type: 'ended', id: msg.id }));
      };
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration) && !sent) {
          clearTimeout(timer);
          timer = setTimeout(() => done(), (a.duration + 5) * 1000);
        }
      };
      a.onended = done;
      a.onerror = done;
      if (msg.caption) {
        cap.textContent = msg.text;
        cap.style.display = 'block';
      }
      a.play().catch(done);
    } else if (msg.type === 'stop') {
      audio?.pause();
      audio = null;
      cap.style.display = 'none';
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

connect();
