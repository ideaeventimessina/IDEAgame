import { QRCodeSVG } from 'qrcode.react';

interface Props {
  text: string;
  size?: number;
  className?: string;
}

export function QrPlaceholder({ text, size = 240, className }: Props) {
  return (
    <div className={className} style={{ background: 'white', padding: 16, borderRadius: 12 }}>
      <QRCodeSVG value={text} size={size - 32} bgColor="#ffffff" fgColor="#0a0820" level="M" includeMargin={false} />
    </div>
  );
}
