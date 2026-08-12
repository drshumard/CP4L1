import React from 'react';
import { useOutletContext } from 'react-router-dom';
import ProfileCard from './ProfileCard';

export default function StaffSettings() {
  const { profile } = useOutletContext();
  return (
    <div className="mx-auto max-w-2xl">
      <ProfileCard profile={profile} />
    </div>
  );
}
