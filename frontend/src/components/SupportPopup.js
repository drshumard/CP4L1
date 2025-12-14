import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const SupportPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    subject: '',
    message: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.email || !formData.subject || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('https://hooks.zapier.com/hooks/catch/1815480/uf7u8ms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'no-cors', // Zapier webhooks require no-cors mode
        body: JSON.stringify({
          purchase_email: formData.email,
          phone_number: formData.phone,
          subject: formData.subject,
          issue_description: formData.message,
          submitted_at: new Date().toISOString()
        }),
      });

      // With no-cors, we can't read the response, but the request was sent
      toast.success('Support request sent! We\'ll get back to you soon.');
      setFormData({ email: '', phone: '', subject: '', message: '' });
      setIsOpen(false);
    } catch (error) {
      console.error('Support request error:', error);
      toast.error('Failed to send request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow"
        aria-label="Open support"
      >
        <MessageCircle size={24} />
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-6 text-white relative">
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
                <h2 className="text-2xl font-bold">Need Help?</h2>
                <p className="text-white/80 mt-1 text-sm">
                  Contact us and we'll get back to you as soon as possible.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Purchase Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email address"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="What is this about?"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Explain what issue you're facing <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Please describe your issue in detail..."
                    required
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupportPopup;
