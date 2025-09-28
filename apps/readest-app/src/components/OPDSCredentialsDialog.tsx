import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from './Dialog';
import IMEInput from './IMEInput';

interface OPDSCredentialsDialogProps {
  isOpen: boolean;
  url: string;
  onClose: () => void;
  onSubmit: (username: string, password: string) => void;
  onTryWithoutAuth: () => void;
}

const OPDSCredentialsDialog: React.FC<OPDSCredentialsDialogProps> = ({
  isOpen,
  url,
  onClose,
  onSubmit,
  onTryWithoutAuth,
}) => {
  const _ = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 如果正在进行输入法合成，暂停提交
    if (isComposing) {
      return;
    }
    onSubmit(username.trim(), password);
    setUsername('');
    setPassword('');
  };

  const handleClose = () => {
    setUsername('');
    setPassword('');
    onClose();
  };

  const handleTryWithoutAuth = () => {
    setUsername('');
    setPassword('');
    onTryWithoutAuth();
  };

  const handleCompositionStateChange = (composing: boolean) => {
    setIsComposing(composing);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={_('Library Authentication')}
      className="opds-credentials-dialog"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-base-200 rounded-lg p-3 mb-4">
          <div className="text-sm font-medium mb-1">{_('Library URL:')}</div>
          <div className="text-xs text-base-content/70 break-all">{url}</div>
        </div>

        <div>
          <label htmlFor="opds-username" className="block text-sm font-medium mb-2">
            {_('Username')}
          </label>
          <IMEInput
            id="opds-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onCompositionStateChange={handleCompositionStateChange}
            placeholder={_('Enter your username')}
            className="input input-bordered w-full"
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="opds-password" className="block text-sm font-medium mb-2">
            {_('Password')}
          </label>
          <div className="relative">
            <IMEInput
              id="opds-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onCompositionStateChange={handleCompositionStateChange}
              placeholder={_('Enter your password')}
              className="input input-bordered w-full pr-12"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-base-content/50 hover:text-base-content/70"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                  <line x1="2" y1="2" x2="22" y2="22"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="text-sm text-base-content/70">
          <p>{_('Enter your credentials to access the OPDS library. These will be used for HTTP Basic Authentication.')}</p>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={!username.trim() || !password.trim()}
          >
            {_('Connect with Credentials')}
          </button>
          <button
            type="button"
            onClick={handleTryWithoutAuth}
            className="btn btn-outline w-full"
          >
            {_('Try without Authentication')}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost w-full"
          >
            {_('Cancel')}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default OPDSCredentialsDialog;