/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Avatar circolare del giocatore: mostra il selfie scattato al login se c'è,
 * altrimenti l'iniziale del nickname sul colore assegnato. Usato ovunque
 * accanto al nome (lobby, classifiche, board dei giochi).
 */
interface PlayerAvatarProps {
  nickname: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  size?: number;
  ring?: string;   // colore del bordo (default bianco tenue)
}

export function PlayerAvatar({ nickname, avatarColor = '#F5B642', avatarUrl, size = 40, ring }: PlayerAvatarProps) {
  const initial = (nickname || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `2px solid ${ring ?? 'rgba(255,255,255,0.25)'}`,
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={nickname} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#0a0820', fontWeight: 900, fontSize: Math.round(size * 0.42), lineHeight: 1 }}>{initial}</span>}
    </div>
  );
}

/** Riduce una foto a un quadrato ~256px JPEG (dataURL) per l'avatar selfie. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('read'));
    fr.readAsDataURL(file);
  });
  const img = document.createElement('img');
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = src; });
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
  return canvas.toDataURL('image/jpeg', 0.82);
}
