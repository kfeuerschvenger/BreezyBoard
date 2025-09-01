import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { X } from 'lucide-react';
import { TemplateService, ColorService } from '@/services';

// Board form data structure
interface BoardFormData {
  title: string;
  description: string;
  color: string;
  template: string;
}

// Template data structure
interface Template {
  _id?: string;
  name: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconName?: keyof typeof Icons;
  columns: Array<string | { title?: string }>;
}

// Color data structure
interface BoardColor {
  _id?: string;
  value: string;
  name: string;
}

// Component props
interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBoard: (data: BoardFormData) => void;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ open, onClose, onCreateBoard }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [boardColors, setBoardColors] = useState<BoardColor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [formData, setFormData] = useState<BoardFormData>({
    title: '',
    description: '',
    color: '',
    template: '',
  });

  // Fetch templates and colors when modal is opened
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templatesData, colorsData] = await Promise.all([
          TemplateService.getAll(),
          ColorService.getByType('board'),
        ]);
        setTemplates(templatesData ?? []);
        setBoardColors(colorsData ?? []);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) fetchData();
  }, [open]);

  // Set default values for formData once templates and colors are available
  useEffect(() => {
    if (!isLoading) {
      setFormData(prev => {
        const next: BoardFormData = { ...prev };
        if (!next.template && templates.length > 0) {
          next.template = templates[0]._id ?? templates[0].name ?? '';
        }
        if ((!next.color || next.color === '') && boardColors.length > 0) {
          next.color = boardColors[0]._id ?? boardColors[0].value ?? '';
        }
        return next;
      });
    }
  }, [isLoading, templates, boardColors]);

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      onCreateBoard(formData);
      // Reset form after submission
      setFormData({
        title: '',
        description: '',
        color: boardColors[0]?._id ?? '#0052CC',
        template: templates[0]?._id ?? '',
      });
    }
  };

  // Update form fields
  const handleInputChange = (field: keyof BoardFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black bg-opacity-50"
          />

          {/* Modal container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 font-heading">Create New Board</h2>
                <p className="text-gray-600 font-body mt-1">Set up your project board with custom settings</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Board Name *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => handleInputChange('title', e.target.value)}
                    placeholder="Enter board name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder="Describe your board's purpose"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  />
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Board Color</label>
                <div className="grid grid-cols-4 gap-3">
                  {boardColors.map(color => {
                    const key = color._id ?? color.value;
                    const isSelected = formData.color === (color._id ?? color.value);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleInputChange('color', color._id ?? color.value)}
                        className={`relative p-3 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected ? 'border-gray-400 ring-2 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="w-full h-8 rounded" style={{ backgroundColor: color.value }}></div>
                        <p className="text-xs text-gray-600 mt-2 text-center">{color.name}</p>
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Board Template</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map(template => {
                    // Resolve icon component
                    const IconComponent =
                      template.icon || (template.iconName ? Icons[template.iconName] : null) || Icons.Folder;

                    const templateKey = template._id ?? template.name;

                    return (
                      <button
                        key={templateKey}
                        type="button"
                        onClick={() => handleInputChange('template', templateKey)}
                        className={`relative p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                          formData.template === templateKey
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-lg ${
                              formData.template === templateKey ? 'bg-blue-100' : 'bg-gray-100'
                            }`}
                          >
                            <IconComponent
                              size={20}
                              className={formData.template === templateKey ? 'text-blue-600' : 'text-gray-600'}
                            />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-1">{template.name}</h4>
                            <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.columns.map((column, index) => {
                                const title = typeof column === 'string' ? column : column.title ?? column;
                                return (
                                  <span key={index} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                    {title}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        {formData.template === templateKey && (
                          <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.title.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  Create Board
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateBoardModal;
