import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Directors from './Directors';
import SimpleHostTab from './SimpleHostTab';

// Hosts = anyone who can host a booked session (owns a Google calendar). Only "Directors" appear on
// the patient portal for booking; PCCs / HCs / VA are manual-book-only hosts.
export default function Hosts() {
  return (
    <div>
      <Tabs defaultValue="directors">
        <TabsList className="grid w-full max-w-md grid-cols-4">
          <TabsTrigger value="directors">Directors</TabsTrigger>
          <TabsTrigger value="pccs">PCCs</TabsTrigger>
          <TabsTrigger value="hcs">HCs</TabsTrigger>
          <TabsTrigger value="va">VA</TabsTrigger>
        </TabsList>
        <TabsContent value="directors" className="mt-5"><Directors /></TabsContent>
        <TabsContent value="pccs" className="mt-5"><SimpleHostTab kind="pcc" /></TabsContent>
        <TabsContent value="hcs" className="mt-5"><SimpleHostTab kind="hc" /></TabsContent>
        <TabsContent value="va" className="mt-5"><SimpleHostTab kind="va" /></TabsContent>
      </Tabs>
    </div>
  );
}
