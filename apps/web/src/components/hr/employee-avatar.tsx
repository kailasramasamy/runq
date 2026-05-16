import { Avatar } from '@/components/ar/primitives';
import { useEmployeePhotoSrc } from '@/hooks/queries/use-employee-documents';

/**
 * Avatar that automatically loads the employee's profile photo. Falls back
 * to coloured initials when no photo is set. Used in lists, headers, and
 * anywhere an employee needs a visual identifier.
 *
 * Each instance opens its own blob-fetch (no auth-header pass-through for
 * <img src>), but React Query dedupes by employeeId so a roster of 50
 * makes 50 requests once per session — acceptable for HR list sizes.
 */
export function EmployeeAvatar({
  employeeId,
  name,
  photoKey,
  size = 28,
}: {
  employeeId: string;
  name: string;
  photoKey: string | null;
  size?: number;
}) {
  const { data: photoSrc } = useEmployeePhotoSrc(employeeId, photoKey);
  return <Avatar name={name} size={size} src={photoSrc ?? undefined} />;
}
