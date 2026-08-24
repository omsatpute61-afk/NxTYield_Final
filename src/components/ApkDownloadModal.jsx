import { useState } from 'react';
import { Download, Smartphone, CheckCircle, ExternalLink, X, Share2 } from 'lucide-react';
import './ApkDownloadModal.css';

export default function ApkDownloadModal({ isOpen, onClose }) {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const apkUrl = import.meta.env.VITE_APK_DOWNLOAD_URL || '/downloads/nxtyield.apk';
  const repoReleasesUrl = 'https://github.com/omsatpute61-afk/NxTYield_Final/releases';

  const handleDownload = () => {
    setDownloadStarted(true);
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = 'NxTYield_v1.0.0.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NxTYield - Smart Agriculture Platform',
          text: 'Download NxTYield Android App for real-time farm sensor monitoring and automated irrigation.',
          url: window.location.origin,
        });
      } catch (err) {
        console.warn('Share error:', err);
      }
    } else {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="apk-modal-backdrop" onClick={onClose}>
      <div className="apk-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="apk-modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        <div className="apk-modal-header">
          <div className="apk-app-icon-wrap">
            <img src="/nxtyield-brand-logo.png" alt="NxTYield Logo" className="apk-app-icon" />
          </div>
          <div className="apk-app-info">
            <h3>NxTYield Android App</h3>
            <p>Smart Agriculture IoT & AI Dashboard • v1.0.0 (Release)</p>
          </div>
        </div>

        <div className="apk-modal-body">
          {/* Main Download Button matching user design */}
          <div className="apk-download-hero-box">
            <span className="apk-hero-subtext">Official Android Client for Farmers</span>
            <button className="apk-hero-btn" onClick={handleDownload}>
              <Download size={20} />
              <span>Download APK (18 MB)</span>
            </button>
            <span className="apk-hero-meta">Compatible with Android 8.0+ (Oreo, Pie, 10, 11, 12, 13, 14, 15)</span>
          </div>

          {downloadStarted && (
            <div className="apk-download-alert success">
              <CheckCircle size={18} />
              <div>
                <strong>Download initiated!</strong>
                <span> If your download did not start automatically, <a href={apkUrl} download="NxTYield_v1.0.0.apk">click here to retry</a>.</span>
              </div>
            </div>
          )}

          {/* Installation Instructions */}
          <div className="apk-install-steps">
            <h4>
              <Smartphone size={16} /> How to Install on Android
            </h4>
            <ol>
              <li>
                <strong>Download the APK file:</strong> Tap the button above to download <code>NxTYield_v1.0.0.apk</code>.
              </li>
              <li>
                <strong>Open downloaded file:</strong> Tap the download complete notification or find it in your device's <em>Downloads / Files</em> folder.
              </li>
              <li>
                <strong>Enable Unknown Sources:</strong> If prompted by Android, tap <em>Settings</em> and enable <em>"Allow from this source"</em>.
              </li>
              <li>
                <strong>Confirm Installation:</strong> Tap <strong>Install</strong> to complete setup and launch NxTYield!
              </li>
            </ol>
          </div>

          <div className="apk-modal-footer-actions">
            <button className="apk-share-btn" onClick={handleShare}>
              <Share2 size={16} />
              {copied ? 'App Link Copied!' : 'Share App with Farmers'}
            </button>
            <a href={repoReleasesUrl} target="_blank" rel="noopener noreferrer" className="apk-github-btn">
              <ExternalLink size={16} /> GitHub Releases
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
