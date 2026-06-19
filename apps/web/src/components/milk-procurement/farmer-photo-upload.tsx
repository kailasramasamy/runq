import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadFarmerAttachment } from '@/hooks/queries/use-milk-procurement';
import { useToast } from '@/components/ui';

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

interface FarmerPhotoUploadProps {
  farmerId: string;
  currentPhotoUrl?: string | null;
}

export function FarmerPhotoUpload({ farmerId, currentPhotoUrl }: FarmerPhotoUploadProps) {
  const upload = useUploadFarmerAttachment(farmerId);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast('Only PNG, JPG, or WEBP images are allowed', 'error');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast('Photo must be under 10 MB', 'error');
      return;
    }
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    upload.mutate(
      { file, kind: 'profile_photo' },
      {
        onSuccess: () => toast('Photo uploaded', 'success'),
        onError: () => { toast('Photo upload failed', 'error'); setPreviewUrl(null); },
      },
    );
  }

  const displayUrl = previewUrl ?? currentPhotoUrl;

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800',
          !displayUrl && 'cursor-pointer hover:border-[var(--accent)]',
        )}
        onClick={() => !upload.isPending && inputRef.current?.click()}
      >
        {upload.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        ) : displayUrl ? (
          <img src={displayUrl} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-5 w-5 text-zinc-400" />
        )}
      </div>
      <div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Profile photo</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          {displayUrl ? 'Change photo' : 'Upload photo'}
        </button>
        <p className="text-xs text-zinc-400">PNG, JPG or WEBP · max 10 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
