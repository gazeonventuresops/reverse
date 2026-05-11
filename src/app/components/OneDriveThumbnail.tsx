import { useState, useEffect } from "react";
import { Loader2, CloudUpload } from "lucide-react";
import { useOneDrive } from "../context/OneDriveContext";

export function OneDriveThumbnail({ itemId }: { itemId: string }) {
  const { getThumbnail } = useOneDrive();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getThumbnail(itemId).then(u => { if (active) { setUrl(u); setLoading(false); } });
    return () => { active = false; };
  }, [itemId, getThumbnail]);

  if (loading) return <div className="aspect-video bg-blue-500/5 flex items-center justify-center"><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /></div>;
  if (!url) return (
    <div className="aspect-video bg-gradient-to-br from-blue-500/10 to-blue-600/5 flex flex-col items-center justify-center border-b border-white/5">
      <CloudUpload className="w-7 h-7 text-blue-400 mb-1" />
      <span className="text-blue-400 text-xs font-semibold">OneDrive</span>
    </div>
  );

  return <img src={url} alt="OneDrive" className="w-full h-full object-cover" loading="lazy" />;
}
