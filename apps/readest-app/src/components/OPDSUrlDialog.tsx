import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from './Dialog';

interface OPDSUrlDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
}

const OPDSUrlDialog: React.FC<OPDSUrlDialogProps> = ({ isOpen, onClose, onSubmit }) => {
  const _ = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const validateUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError(_('请输入OPDS URL'));
      return;
    }

    if (!validateUrl(url.trim())) {
      setError(_('请输入有效的URL (必须以http://或https://开头)'));
      return;
    }

    onSubmit(url.trim());
    setUrl('');
    onClose();
  };

  const handleClose = () => {
    setUrl('');
    setError('');
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={_('Add OPDS Library')}
      className="opds-url-dialog"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="opds-url" className="block text-sm font-medium mb-2">
            {_('OPDS URL')}
          </label>
          <input
            id="opds-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={_('https://example.com/opds')}
            className="input input-bordered w-full"
          />
          {error && (
            <p className="text-error text-sm mt-1" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="text-sm text-base-content/70">
          <p className="mb-2">{_('Enter the OPDS catalog URL for your library.')}</p>
          <p className="mb-1">{_('Examples:')}</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>https://your-server.com/opds</li>
            <li>http://192.168.1.100:8083/opds</li>
            <li>https://calibre-web.example.com/opds</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost flex-1"
          >
            {_('Cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={!url.trim()}
          >
            {_('Continue')}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default OPDSUrlDialog;