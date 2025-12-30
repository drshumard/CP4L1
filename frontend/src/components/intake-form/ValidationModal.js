import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { AlertCircle, X } from 'lucide-react';

const ValidationModal = ({ showValidationModal, setShowValidationModal, missingFields, scrollToField }) => {
  return (
    <AnimatePresence>
      {showValidationModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setShowValidationModal(false)}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Required Fields Missing</h3>
                </div>
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* Content */}
              <div className="p-6">
                <p className="text-gray-600 mb-4">Please complete the following required fields:</p>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {missingFields.map((field, index) => (
                    <div
                      key={field.field}
                      className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        <span className="text-gray-700 font-medium">{field.label}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => scrollToField(field.id)}
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                      >
                        Fix
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <Button
                  onClick={() => setShowValidationModal(false)}
                  variant="outline"
                  className="mr-2"
                >
                  Close
                </Button>
                <Button
                  onClick={() => scrollToField(missingFields[0]?.id)}
                  className="bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600"
                >
                  Fix First Field
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ValidationModal;
