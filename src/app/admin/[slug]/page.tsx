'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import axios from 'axios';

interface ConfigFile {
  name: string;
  download_url: string;
}

interface ComparisonConfig {
  configId: string;
  configTitle: string;
  [key: string]: any;
}

export default function AdminPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug;

  const [isValidSlug, setIsValidSlug] = useState<boolean | null>(null);
  const [configs, setConfigs] = useState<ConfigFile[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(true);
  const [runningStatus, setRunningStatus] = useState<Record<string, string>>({});
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationStatus, setRevalidationStatus] = useState('');

  const adminSecretSlug = process.env.NEXT_PUBLIC_ADMIN_SECRET_SLUG;

  useEffect(() => {
    if (typeof slug === 'string') {
      if (!adminSecretSlug) {
        console.warn("AdminPage: NEXT_PUBLIC_ADMIN_SECRET_SLUG is not set. Access will be denied.");
        setIsValidSlug(false);
      } else if (slug === adminSecretSlug) {
        setIsValidSlug(true);
      } else {
        setIsValidSlug(false);
      }
    } else if (slug) {
        setIsValidSlug(false);
    }
  }, [slug, adminSecretSlug]);

  useEffect(() => {
    if (isValidSlug === false) {
      console.log("AdminPage: Slug is invalid or not provided correctly, access denied.");
    }
  }, [isValidSlug, router]);

  useEffect(() => {
    if (isValidSlug === true) {
      const fetchConfigs = async () => {
        setLoadingConfigs(true);
        try {
          const response = await axios.get('https://api.github.com/repos/civiceval/configs/contents/blueprints');
          if (Array.isArray(response.data)) {
            const jsonFiles = response.data.filter(
              (file: any) => file.type === 'file' && file.name.endsWith('.json') && file.download_url
            );
            setConfigs(jsonFiles);
          } else {
            console.error("Failed to fetch configs: response data is not an array", response.data);
            setConfigs([]);
          }
        } catch (error) {
          console.error('Error fetching admin configs:', error);
          setConfigs([]);
        }
        setLoadingConfigs(false);
      };
      fetchConfigs();
    }
  }, [isValidSlug]);

  const handleRunNow = async (configFile: ConfigFile) => {
    setRunningStatus(prev => ({ ...prev, [configFile.name]: 'Submitting...' }));
    try {
      const configResponse = await axios.get<ComparisonConfig>(configFile.download_url);
      const configContent = configResponse.data;

      if (!configContent || typeof configContent !== 'object') {
        throw new Error('Failed to fetch valid config content.');
      }

      const apiResponse = await axios.post('/api/admin/trigger-eval', { config: configContent });
      
      if (apiResponse.status === 200 || apiResponse.status === 202) {
        setRunningStatus(prev => ({ ...prev, [configFile.name]: 'Run successfully submitted!' }));
      } else {
        setRunningStatus(prev => ({ ...prev, [configFile.name]: `Error: ${apiResponse.data.message || 'Submission failed with status ' + apiResponse.status}` }));
      }
    } catch (error: any) {
      let errorMessage = 'Failed to submit run.';
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      console.error('Error triggering evaluation:', error);
      setRunningStatus(prev => ({ ...prev, [configFile.name]: `Error: ${errorMessage}` }));
    }
  };

  const handleRevalidate = async () => {
    setRevalidating(true);
    setRevalidationStatus('Triggering...');
    try {
      const response = await axios.post('/api/admin/revalidate', {
        secret: slug,
        path: '/', // Revalidate the homepage
      });

      if (response.status === 200 && response.data.revalidated) {
        setRevalidationStatus('Success! Homepage cache is being refreshed.');
      } else {
        setRevalidationStatus(`Error: ${response.data.message || 'Failed to trigger revalidation.'}`);
      }
    } catch (error: any) {
      let errorMessage = 'An unknown error occurred.';
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      console.error('Error triggering revalidation:', error);
      setRevalidationStatus(`Error: ${errorMessage}`);
    } finally {
      setRevalidating(false);
    }
  };

  if (isValidSlug === null) {
    return <div className="min-h-screen flex items-center justify-center p-4">Verifying access...</div>;
  }

  if (isValidSlug === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
        <p>You do not have permission to view this page, or the admin URL is incorrect.</p>
        <p className="text-sm text-gray-500 mt-2">Ensure NEXT_PUBLIC_ADMIN_SECRET_SLUG is correctly set and matches the URL.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Admin Panel</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">Manually Trigger Evaluations</p>
            </div>
            <div>
                <button
                  onClick={handleRevalidate}
                  disabled={revalidating}
                  className="mt-4 sm:mt-0 px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap transition-colors duration-150 ease-in-out"
                >
                  {revalidating ? 'Refreshing...' : 'Force Homepage Refresh'}
                </button>
                {revalidationStatus && (
                    <p className={`mt-2 text-xs text-right ${revalidationStatus.toLowerCase().includes('error') ? 'text-red-500' : 'text-gray-500'}`}>{revalidationStatus}</p>
                )}
            </div>
        </div>
      </header>
      
      {loadingConfigs ? (
        <p>Loading configurations from GitHub...</p>
      ) : configs.length === 0 ? (
        <p>No configurations found in the civiceval/configs repository (or an error occurred while fetching).</p>
      ) : (
        <div className="space-y-4">
          {configs.map((configFile) => (
            <div key={configFile.name} className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2 sm:mb-0 break-all">{configFile.name}</h2>
                <button
                  onClick={() => handleRunNow(configFile)}
                  disabled={runningStatus[configFile.name] === 'Submitting...'}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap transition-colors duration-150 ease-in-out"
                >
                  {runningStatus[configFile.name] === 'Submitting...' ? 'Submitting...' : 'Run Now'}
                </button>
              </div>
              {runningStatus[configFile.name] && (
                <p className={`mt-3 text-sm font-medium ${runningStatus[configFile.name].toLowerCase().includes('error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  Status: {runningStatus[configFile.name]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 