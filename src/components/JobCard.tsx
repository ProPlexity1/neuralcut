import React from 'react';
import type { GenerationJob } from '../types';

interface JobCardProps {
  job: GenerationJob;
}

export default function JobCard({ job }: JobCardProps) {
  const statusColors = {
    idle: 'bg-gray-700',
    queued: 'bg-yellow-700',
    loading_model: 'bg-blue-700',
    generating: 'bg-purple-700',
    done: 'bg-green-700',
    error: 'bg-red-700',
  };

  const statusLabels = {
    idle: 'Idle',
    queued: 'Queued',
    loading_model: 'Loading',
    generating: 'Generating',
    done: 'Done',
    error: 'Error',
  };

  return (
    <div className="p-3 bg-gray-800 rounded border border-gray-700 hover:border-gray-600 transition">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-gray-400">{job.id}</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${
            statusColors[job.status]
          }`}
        >
          {statusLabels[job.status]}
        </span>
      </div>
      <p className="text-xs text-gray-300 truncate mb-2">{job.prompt}</p>
      {job.status === 'generating' || job.status === 'loading_model' ? (
        <div className="space-y-1">
          <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{Math.round(job.progress)}%</span>
            <span>{job.eta}s remaining</span>
          </div>
        </div>
      ) : null}
      {job.error && <p className="text-xs text-red-400 mt-1">{job.error}</p>}
    </div>
  );
}