import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { HeartHandshake, ExternalLink } from 'lucide-react';

const CHECKOUT_URL = process.env.REACT_APP_CHECKOUT_URL || 'https://drshumardworkshop.com/checkout3';

const RefundedPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full shadow-lg border-0">
        <CardContent className="p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <HeartHandshake className="w-10 h-10 text-gray-500" />
          </div>
          
          {/* Heading */}
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            We're Sorry to See You Go
          </h1>
          
          {/* Message */}
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            Your account has been refunded. We understand that circumstances change, and we respect your decision.
          </p>
          
          <p className="text-gray-600 mb-8">
            If you change your mind, we'd love to have you back. You can purchase another consultation below to restart your wellness journey.
          </p>
          
          {/* CTA Button */}
          <a 
            href={CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full"
          >
            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-4 text-lg rounded-lg flex items-center justify-center gap-2"
            >
              Purchase New Consultation
              <ExternalLink size={20} />
            </Button>
          </a>
          
          {/* Support info */}
          <p className="text-sm text-gray-500 mt-6">
            Questions? Contact us at{' '}
            <a href="mailto:support@drshumard.com" className="text-teal-600 underline">
              support@drshumard.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RefundedPage;
