import { useRouter } from 'next/router';
import { AuthProvider } from '@/context/AuthContext';
import { EnvProvider } from '@/context/EnvContext';
import { SyncProvider } from '@/context/SyncContext';
import Reader from '@/app/reader/components/Reader';

export default function Page() {
  const router = useRouter();
  const ids = router.query['ids'] as string;
  
  // Simple test component to isolate the issue
  if (!ids) {
    return <div>Loading...</div>;
  }
  
  return (
    <EnvProvider>
      <AuthProvider>
        <SyncProvider>
          <Reader ids={ids} />
        </SyncProvider>
      </AuthProvider>
    </EnvProvider>
  );
}
