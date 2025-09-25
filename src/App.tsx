import React, { useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Switch } from './components/ui/switch';
import { Progress } from './components/ui/progress';
import { Separator } from './components/ui/separator';
import { Eye, EyeOff, Camera, Search, Plus, Minus, Check, X, Menu, Share, User, Filter, ChevronDown, ChevronUp, RotateCcw, Image as ImageIcon, Clock, Users, ChefHat, Heart, ShoppingCart, ExternalLink, AlertTriangle, ChevronLeft, Snowflake } from 'lucide-react';
import exampleImage from 'figma:asset/107d30777e79d94cb889d4ab56d6b40e678fee2a.png';

export default function App() {
  const [currentFrame, setCurrentFrame] = useState('fridge');
  const [authVariant, setAuthVariant] = useState('A');
  const [fridgeVariant, setFridgeVariant] = useState('A');
  const [editorVariant, setEditorVariant] = useState('A');
  const [receiptVariant, setReceiptVariant] = useState('A');
  const [queueVariant, setQueueVariant] = useState('A');
  const [shoppingVariant, setShoppingVariant] = useState('A');
  const [recipesDiscoverVariant, setRecipesDiscoverVariant] = useState('A');
  const [recipesResultsVariant, setRecipesResultsVariant] = useState('A');
  const [recipeDetailVariant, setRecipeDetailVariant] = useState('A');
  const [recipeImportVariant, setRecipeImportVariant] = useState('A');
  const [importUrl, setImportUrl] = useState('');
  const [showGuidedCapture, setShowGuidedCapture] = useState(false);
  const [showSearchView, setShowSearchView] = useState(false);
  const [activeInventoryCategory, setActiveInventoryCategory] = useState('all');
  const [selectedFilters, setSelectedFilters] = useState({
    dietary: [],
    allergies: [],
    cuisine: [],
    mealType: [],
    cookTime: [],
    difficulty: [],
    special: []
  });
  const [onlyHighMatch, setOnlyHighMatch] = useState(false);

  const frames = [
    'auth', 'fridge', 'editor', 'receipt', 'queue', 'shopping', 
    'recipes-discover', 'recipes-results', 'recipe-detail', 'recipe-import', 'recipe-components'
  ];

  // Sample inventory data
  const inventoryItems = [
    { type: "beef", name: "Ground Beef", quantity: "1.2", unit: "lb", expiryDays: 3, location: "fridge" },
    { type: "lettuce", name: "Bok Choy", quantity: "1", unit: "bunch", expiryDays: 5, location: "fridge" },
    { type: "eggs", name: "Eggs", quantity: "8", unit: "pieces", expiryDays: 14, location: "fridge" },
    { type: "milk", name: "Soy Milk", quantity: "32", unit: "fl oz", expiryDays: 7, location: "fridge" },
    { type: "shrimp", name: "Frozen Shrimp", quantity: "1", unit: "lb", expiryDays: 90, location: "freezer" },
    { type: "broccoli", name: "Frozen Broccoli", quantity: "2", unit: "lbs", expiryDays: 120, location: "freezer" },
    { type: "chicken", name: "Chicken Breast", quantity: "2.5", unit: "lbs", expiryDays: 180, location: "freezer" },
    { type: "bread", name: "Whole Wheat Bread", quantity: "1", unit: "loaf", expiryDays: 45, location: "pantry" },
    { type: "tomato", name: "Canned Tomatoes", quantity: "28", unit: "oz", expiryDays: 365, location: "pantry" },
    { type: "pasta", name: "Pasta", quantity: "2", unit: "lbs", expiryDays: 180, location: "pantry" },
    { type: "oil", name: "Olive Oil", quantity: "16.9", unit: "fl oz", expiryDays: 120, location: "pantry" }
  ];

  // Filter items based on active category
  const getFilteredItems = () => {
    if (activeInventoryCategory === 'all') {
      return inventoryItems;
    }
    return inventoryItems.filter(item => item.location === activeInventoryCategory);
  };

  // Group items by location for "All" view
  const getGroupedItems = () => {
    const filtered = getFilteredItems();
    if (activeInventoryCategory === 'all') {
      return {
        fridge: filtered.filter(item => item.location === 'fridge'),
        freezer: filtered.filter(item => item.location === 'freezer'),
        pantry: filtered.filter(item => item.location === 'pantry')
      };
    }
    return { [activeInventoryCategory]: filtered };
  };

  // Location Section Header Component
  const LocationSectionHeader = ({ location, count }) => {
    const getLocationInfo = () => {
      switch (location) {
        case 'fridge':
          return { name: 'Fridge', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: '❄️' };
        case 'freezer':
          return { name: 'Freezer', color: 'text-cyan-600', bgColor: 'bg-cyan-50', icon: '🧊' };
        case 'pantry':
          return { name: 'Pantry', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: '🏺' };
        default:
          return { name: location, color: 'text-gray-600', bgColor: 'bg-gray-50', icon: '📦' };
      }
    };

    const { name, color, bgColor, icon } = getLocationInfo();

    return (
      <div className={`sticky top-0 ${bgColor} px-4 py-2 border-b z-10`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className={`${color} capitalize`}>{name}</h3>
          <Badge variant="secondary" className="text-xs">{count} items</Badge>
        </div>
      </div>
    );
  };

  // Cute Food Item Component
  const CuteFoodItem = ({ type, name, quantity, unit, expiryDays, location, expired = false }) => {
    const getCuteIcon = () => {
      const iconClass = "w-12 h-12 rounded-lg flex items-center justify-center text-2xl";
      
      switch (type) {
        case 'beef':
          return <div className={`${iconClass} bg-pink-100`}>🐄</div>;
        case 'lettuce':
          return <div className={`${iconClass} bg-green-100`}>🥬</div>;
        case 'broccoli':
          return <div className={`${iconClass} bg-green-100`}>🥦</div>;
        case 'eggs':
          return <div className={`${iconClass} bg-yellow-100`}>🥚</div>;
        case 'milk':
          return <div className={`${iconClass} bg-blue-100`}>🥛</div>;
        case 'shrimp':
          return <div className={`${iconClass} bg-orange-100`}>🦐</div>;
        case 'chicken':
          return <div className={`${iconClass} bg-yellow-100`}>🐔</div>;
        case 'fish':
          return <div className={`${iconClass} bg-blue-100`}>🐟</div>;
        case 'tomato':
          return <div className={`${iconClass} bg-red-100`}>🍅</div>;
        case 'carrot':
          return <div className={`${iconClass} bg-orange-100`}>🥕</div>;
        case 'cheese':
          return <div className={`${iconClass} bg-yellow-100`}>🧀</div>;
        case 'bread':
          return <div className={`${iconClass} bg-amber-100`}>🍞</div>;
        case 'apple':
          return <div className={`${iconClass} bg-red-100`}>🍎</div>;
        case 'banana':
          return <div className={`${iconClass} bg-yellow-100`}>🍌</div>;
        case 'rice':
          return <div className={`${iconClass} bg-yellow-100`}>🍚</div>;
        case 'pasta':
          return <div className={`${iconClass} bg-yellow-100`}>🍝</div>;
        case 'oil':
          return <div className={`${iconClass} bg-yellow-100`}>🫒</div>;
        default:
          return <div className={`${iconClass} bg-gray-100`}>🍽️</div>;
      }
    };

    const getExpiryColor = () => {
      if (expired) return 'text-red-500';
      if (expiryDays <= 3) return 'text-orange-500';
      return 'text-gray-500';
    };

    const getExpiryText = () => {
      if (expired) return 'Expired';
      if (expiryDays <= 30) return `${expiryDays} days left`;
      return `${expiryDays} days left`;
    };

    const getLocationColor = () => {
      switch (location) {
        case 'fridge': return 'bg-blue-400';
        case 'freezer': return 'bg-cyan-400';
        case 'pantry': return 'bg-amber-400';
        default: return 'bg-green-400';
      }
    };

    return (
      <div 
        className="flex items-center p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
        onClick={() => setCurrentFrame('editor')}
      >
        {activeInventoryCategory === 'all' && (
          <div className={`w-1 h-12 rounded-full mr-3 ${getLocationColor()}`}></div>
        )}
        {getCuteIcon()}
        <div className="flex-1 ml-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h4 className="text-base">{name}</h4>
              {activeInventoryCategory === 'all' && (
                <div className="text-xs text-gray-400 capitalize mb-1">{location}</div>
              )}
              <div className={`text-xs ${getExpiryColor()} flex items-center gap-1`}>
                {expiryDays <= 3 && <Snowflake className="w-3 h-3" />}
                {getExpiryText()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-7 h-7 p-0 hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle quantity decrease
                }}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <div className="text-sm text-center min-w-[2rem]">
                <div>{quantity}</div>
                <div className="text-xs text-gray-400">{unit}</div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-7 h-7 p-0 hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle quantity increase
                }}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Reusable Components
  const FridgeItem = ({ type, size = "md", quantity = "full" }) => {
    const getItemVisual = () => {
      switch (type) {
        case 'milk':
          return (
            <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-12'} bg-white rounded-sm border border-gray-300 relative`}>
              <div className={`absolute top-1 left-1/2 transform -translate-x-1/2 w-2 h-1 bg-blue-400 rounded-full`}></div>
              <div className={`absolute bottom-0 left-0 right-0 ${quantity === 'low' ? 'h-1/4' : quantity === 'half' ? 'h-1/2' : 'h-3/4'} bg-white rounded-sm`}></div>
            </div>
          );
        case 'juice':
          return (
            <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-12'} bg-orange-200 rounded-sm border border-gray-300 relative`}>
              <div className={`absolute top-1 left-1/2 transform -translate-x-1/2 w-2 h-1 bg-orange-400 rounded-full`}></div>
              <div className={`absolute bottom-0 left-0 right-0 ${quantity === 'low' ? 'h-1/4' : quantity === 'half' ? 'h-1/2' : 'h-3/4'} bg-orange-300 rounded-sm`}></div>
            </div>
          );
        case 'eggs':
          return (
            <div className={`${size === 'sm' ? 'w-8 h-4' : 'w-12 h-6'} bg-gray-100 rounded border border-gray-300 relative`}>
              <div className="absolute inset-1 grid grid-cols-6 gap-px">
                {[...Array(quantity === 'low' ? 3 : quantity === 'half' ? 6 : 12)].map((_, i) => (
                  <div key={i} className="w-1 h-1 bg-yellow-100 rounded-full border border-yellow-200"></div>
                ))}
              </div>
            </div>
          );
        case 'yogurt':
          return (
            <div className={`${size === 'sm' ? 'w-5 h-6' : 'w-6 h-8'} bg-pink-100 rounded border border-gray-300 relative`}>
              <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-3 h-1 bg-pink-300 rounded"></div>
            </div>
          );
        case 'cheese':
          return (
            <div className={`${size === 'sm' ? 'w-4 h-3' : 'w-6 h-4'} bg-yellow-200 rounded border border-gray-300 relative`}>
              <div className="absolute inset-1 bg-yellow-300 rounded"></div>
            </div>
          );
        case 'butter':
          return (
            <div className={`${size === 'sm' ? 'w-4 h-3' : 'w-5 h-4'} bg-yellow-100 rounded border border-gray-300 relative`}>
              <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-yellow-600">B</div>
            </div>
          );
        case 'lettuce':
          return (
            <div className={`${size === 'sm' ? 'w-6 h-5' : 'w-8 h-6'} bg-green-200 rounded-full relative`}>
              <div className="absolute inset-1 bg-green-300 rounded-full"></div>
              <div className="absolute top-1 left-2 w-1 h-1 bg-green-400 rounded"></div>
            </div>
          );
        case 'carrots':
          return (
            <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} relative`}>
              <div className="absolute left-0 w-1 h-full bg-orange-400 rounded-full"></div>
              <div className="absolute left-1 w-1 h-full bg-orange-400 rounded-full"></div>
              <div className="absolute left-2 w-1 h-full bg-orange-400 rounded-full"></div>
              <div className="absolute top-0 left-0 w-3 h-1 bg-green-400 rounded"></div>
            </div>
          );
        case 'apples':
          return (
            <div className={`${size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} bg-red-300 rounded-full relative`}>
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-green-500 rounded"></div>
            </div>
          );
        case 'leftovers':
          return (
            <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-white rounded border border-gray-300 relative`}>
              <div className="absolute inset-1 bg-orange-200 rounded"></div>
              <div className="absolute top-1 right-1 w-1 h-1 bg-red-300 rounded"></div>
            </div>
          );
        case 'sauce':
          return (
            <div className={`${size === 'sm' ? 'w-3 h-6' : 'w-4 h-8'} bg-red-600 rounded-sm border border-gray-300 relative`}>
              <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full"></div>
            </div>
          );
        default:
          return (
            <div className={`${size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'} bg-gray-300 rounded`}>
            </div>
          );
      }
    };

    return (
      <div className="flex flex-col items-center gap-1">
        {getItemVisual()}
      </div>
    );
  };

  const PantryItem = ({ type, size = "md" }) => {
    const getItemVisual = () => {
      switch (type) {
        case 'rice':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-white rounded border border-gray-300 relative`}>
            <div className="absolute inset-1 bg-gray-100 rounded"></div>
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-600">Rice</div>
          </div>;
        case 'pasta':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-yellow-100 rounded border border-gray-300 relative`}>
            <div className="absolute inset-1 bg-yellow-200 rounded"></div>
            <div className="absolute top-2 left-1 w-1 h-4 bg-yellow-400 rounded-full"></div>
            <div className="absolute top-2 right-1 w-1 h-4 bg-yellow-400 rounded-full"></div>
          </div>;
        case 'flour':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-gray-100 rounded border border-gray-300 relative`}>
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-600">Flour</div>
          </div>;
        case 'cereal':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-orange-200 rounded border border-gray-300 relative`}>
            <div className="absolute inset-1 bg-orange-300 rounded"></div>
          </div>;
        case 'beans':
          return <div className={`${size === 'sm' ? 'w-4 h-6' : 'w-5 h-8'} bg-red-200 rounded-full border border-gray-300`}></div>;
        case 'tomatoes':
          return <div className={`${size === 'sm' ? 'w-4 h-6' : 'w-5 h-8'} bg-red-300 rounded-full border border-gray-300`}></div>;
        case 'soup':
          return <div className={`${size === 'sm' ? 'w-4 h-6' : 'w-5 h-8'} bg-orange-300 rounded-full border border-gray-300`}></div>;
        case 'tuna':
          return <div className={`${size === 'sm' ? 'w-4 h-3' : 'w-5 h-4'} bg-blue-200 rounded border border-gray-300`}></div>;
        case 'oil':
          return <div className={`${size === 'sm' ? 'w-3 h-8' : 'w-4 h-10'} bg-yellow-300 rounded border border-gray-300`}></div>;
        case 'vinegar':
          return <div className={`${size === 'sm' ? 'w-3 h-8' : 'w-4 h-10'} bg-amber-800 rounded border border-gray-300`}></div>;
        case 'honey':
          return <div className={`${size === 'sm' ? 'w-4 h-6' : 'w-5 h-8'} bg-amber-300 rounded border border-gray-300`}></div>;
        case 'salt':
          return <div className={`${size === 'sm' ? 'w-3 h-6' : 'w-4 h-8'} bg-white rounded border border-gray-300`}></div>;
        case 'crackers':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-yellow-100 rounded border border-gray-300`}></div>;
        case 'nuts':
          return <div className={`${size === 'sm' ? 'w-5 h-6' : 'w-6 h-8'} bg-amber-200 rounded border border-gray-300`}></div>;
        case 'chips':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-red-100 rounded border border-gray-300`}></div>;
        default:
          return <div className={`${size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'} bg-gray-300 rounded`}></div>;
      }
    };

    return <div className="flex flex-col items-center">{getItemVisual()}</div>;
  };

  const FreezerItem = ({ type, size = "md" }) => {
    const getItemVisual = () => {
      switch (type) {
        case 'ice-cream':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-pink-200 rounded border border-gray-300 relative`}>
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-2 h-1 bg-pink-400 rounded"></div>
          </div>;
        case 'frozen-berries':
          return <div className={`${size === 'sm' ? 'w-5 h-6' : 'w-6 h-8'} bg-purple-200 rounded border border-gray-300`}></div>;
        case 'popsicles':
          return <div className={`${size === 'sm' ? 'w-6 h-8' : 'w-8 h-10'} bg-blue-200 rounded border border-gray-300`}></div>;
        case 'chicken':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-pink-100 rounded border border-gray-300`}></div>;
        case 'beef':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-red-200 rounded border border-gray-300`}></div>;
        case 'fish':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-blue-100 rounded border border-gray-300`}></div>;
        case 'peas':
          return <div className={`${size === 'sm' ? 'w-5 h-6' : 'w-6 h-8'} bg-green-200 rounded border border-gray-300`}></div>;
        case 'pizza':
          return <div className={`${size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'} bg-yellow-200 rounded border border-gray-300 relative`}>
            <div className="absolute top-1 left-1 w-1 h-1 bg-red-400 rounded-full"></div>
          </div>;
        case 'bread':
          return <div className={`${size === 'sm' ? 'w-6 h-4' : 'w-8 h-5'} bg-amber-100 rounded border border-gray-300`}></div>;
        default:
          return <div className={`${size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'} bg-gray-300 rounded`}></div>;
      }
    };

    return <div className="flex flex-col items-center">{getItemVisual()}</div>;
  };

  // Recipe Components
  const RecipeCard = ({ title, image, time, servings, matchPercent, haveCount, missingCount, tags = [], isUseItUp = false }) => (
    <Card className="w-full min-w-[280px] mr-4 last:mr-0">
      <div className="relative">
        <div className="w-full h-32 bg-gray-200 rounded-t-lg flex items-center justify-center">
          <ChefHat className="w-8 h-8 text-gray-400" />
        </div>
        {isUseItUp && (
          <div className="absolute top-2 left-2">
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Use it up
            </Badge>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="text-xs">
            {matchPercent}% match
          </Badge>
        </div>
      </div>
      <CardContent className="p-3">
        <h4 className="truncate mb-2">{title}</h4>
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{time}min</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{servings}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">
            Have {haveCount}
          </Badge>
          <Badge variant="outline" className="text-xs text-orange-600">
            Missing {missingCount}
          </Badge>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const RecipeCardVertical = ({ title, time, servings, matchPercent, haveCount, missingCount, tags = [], isUseItUp = false }) => (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="relative w-20 h-20 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-6 h-6 text-gray-400" />
            {isUseItUp && (
              <div className="absolute -top-1 -left-1">
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="w-3 h-3" />
                </Badge>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between mb-1">
              <h4 className="truncate pr-2">{title}</h4>
              <Badge variant="secondary" className="text-xs">
                {matchPercent}%
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{time}min</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{servings}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                Have {haveCount}
              </Badge>
              <Badge variant="outline" className="text-xs text-orange-600">
                Missing {missingCount}
              </Badge>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 2).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const FilterChip = ({ children, active = false, onClick }) => (
    <Badge 
      variant={active ? "default" : "outline"} 
      className="cursor-pointer"
      onClick={onClick}
    >
      {children}
    </Badge>
  );

  const FilterBar = ({ onlyHighMatch = false, setOnlyHighMatch }) => (
    <div className="sticky top-0 bg-white border-b p-4 z-10">
      <div className="flex flex-wrap gap-2 mb-3">
        <FilterChip>Vegetarian</FilterChip>
        <FilterChip>Vegan</FilterChip>
        <FilterChip>Keto</FilterChip>
        <FilterChip active>&lt; 30min</FilterChip>
        <FilterChip>No Nuts</FilterChip>
        <FilterChip>Dairy Free</FilterChip>
        <FilterChip>Italian</FilterChip>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch 
            checked={onlyHighMatch} 
            onCheckedChange={setOnlyHighMatch}
          />
          <span className="text-sm">Only show ≥70% match</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">Clear</Button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600">Apply</Button>
        </div>
      </div>
    </div>
  );

  const IngredientList = ({ haveIngredients, missingIngredients, onAddMissing }) => (
    <div className="space-y-4">
      {haveIngredients.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 mb-3">
            <Check className="w-5 h-5 text-green-500" />
            Have ({haveIngredients.length})
          </h3>
          <div className="space-y-2">
            {haveIngredients.map((ingredient, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-green-50 rounded">
                <span>{ingredient.name}</span>
                <span className="text-sm text-gray-500">{ingredient.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {missingIngredients.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 mb-3">
            <Minus className="w-5 h-5 text-orange-500" />
            Missing ({missingIngredients.length})
          </h3>
          <div className="space-y-2">
            {missingIngredients.map((ingredient, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <span>{ingredient.name}</span>
                <span className="text-sm text-gray-500">{ingredient.amount}</span>
              </div>
            ))}
          </div>
          <Button 
            onClick={onAddMissing}
            variant="outline" 
            className="w-full mt-3"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Add Missing to List
          </Button>
        </div>
      )}
    </div>
  );

  const ImportBar = ({ url, setUrl, onImport }) => (
    <div className="p-4 border-b">
      <div className="flex gap-2">
        <Input 
          placeholder="Paste recipe URL here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button onClick={onImport} disabled={!url}>
          Import
        </Button>
      </div>
    </div>
  );

  const GuidedCapture = ({ onSave }) => (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-sm mb-2">Recipe Title</label>
        <Input placeholder="Enter recipe name..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-2">Time (minutes)</label>
          <Input placeholder="30" type="number" />
        </div>
        <div>
          <label className="block text-sm mb-2">Servings</label>
          <Input placeholder="4" type="number" />
        </div>
      </div>

      <div>
        <label className="block text-sm mb-2">Ingredients (one per line)</label>
        <textarea 
          className="w-full h-32 p-3 border rounded-lg resize-none"
          placeholder="2 cups flour&#10;1 tsp salt&#10;3 eggs&#10;1 cup milk"
        />
      </div>

      <div>
        <label className="block text-sm mb-2">Instructions (one step per line)</label>
        <textarea 
          className="w-full h-32 p-3 border rounded-lg resize-none"
          placeholder="Mix dry ingredients in bowl&#10;Add eggs and milk&#10;Whisk until smooth&#10;Cook in pan for 2-3 minutes"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-2">Cuisine</label>
          <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer">
            <span>Italian</span>
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </div>
        </div>
        <div>
          <label className="block text-sm mb-2">Diet Tags</label>
          <div className="flex flex-wrap gap-1">
            <FilterChip>Vegetarian</FilterChip>
            <FilterChip active>Dairy</FilterChip>
          </div>
        </div>
      </div>

      <Button 
        onClick={onSave}
        className="w-full bg-green-500 hover:bg-green-600"
      >
        Save Recipe
      </Button>
    </div>
  );

  const BottomTabBar = ({ activeTab = 'recipes' }) => (
    <div className="border-t bg-white">
      <div className="grid grid-cols-4 h-16">
        <button className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'fridge' ? 'text-green-500' : 'text-gray-400'}`}>
          <div className="w-6 h-6 bg-current rounded opacity-20"></div>
          <span className="text-xs">Inventory</span>
        </button>
        <button className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'recipes' ? 'text-green-500' : 'text-gray-400'}`}>
          <ChefHat className="w-6 h-6" />
          <span className="text-xs">Recipes</span>
        </button>
        <button className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'shopping' ? 'text-green-500' : 'text-gray-400'}`}>
          <ShoppingCart className="w-6 h-6" />
          <span className="text-xs">Shopping</span>
        </button>
        <button className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'profile' ? 'text-green-500' : 'text-gray-400'}`}>
          <User className="w-6 h-6" />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </div>
  );

  const ItemRow = ({ name, qty, unit, bad = false, isEditing = false }) => (
    <div className="flex items-center justify-between p-3 border-b border-gray-100">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={isEditing ? 'text-blue-600' : ''}>{name}</span>
          {bad && <span className="text-red-500 text-sm">Bad</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Minus className="w-4 h-4" />
          </Button>
          <span className="text-sm w-8 text-center">{qty}</span>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const FixQueueCard = ({ rawLine, guess, icChips, attrChips }) => (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="text-sm text-gray-500 mb-3">{rawLine}</div>
        
        {/* Item Name */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Item Name</label>
          <Input defaultValue={guess} className="mb-2" />
        </div>

        {/* Quantity and Price */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Quantity</label>
            <Input defaultValue="1" className="text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Unit</label>
            <Input defaultValue="lb" className="text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Price</label>
            <Input defaultValue="$4.99" className="text-sm" />
          </div>
        </div>

        {/* Categories */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Categories</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {icChips.map((chip, i) => (
              <Badge key={i} variant="secondary" className="cursor-pointer text-xs">{chip}</Badge>
            ))}
            <Button variant="outline" size="sm" className="h-5 px-2 text-xs border-dashed">
              <Plus className="w-2 h-2 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* Attributes */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Attributes</label>
          <div className="flex flex-wrap gap-1">
            {attrChips.map((chip, i) => (
              <Badge key={i} variant="outline" className="cursor-pointer text-xs">{chip}</Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm">Skip</Button>
          <div className="flex items-center gap-2">
            <Switch />
            <span className="text-sm">Apply to similar</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const SearchFilterSection = ({ title, items, selectedItems, onToggle, category }) => {
    const [expanded, setExpanded] = useState(false);
    
    return (
      <div className="border-b pb-4">
        <div 
          className="flex items-center justify-between cursor-pointer py-2"
          onClick={() => setExpanded(!expanded)}
        >
          <h3 className="text-sm">{title}</h3>
          <div className="flex items-center gap-2">
            {selectedItems.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedItems.length}
              </Badge>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
        {expanded && (
          <div className="flex flex-wrap gap-2 mt-3">
            {items.map((item) => (
              <FilterChip
                key={item}
                active={selectedItems.includes(item)}
                onClick={() => onToggle(category, item)}
              >
                {item}
              </FilterChip>
            ))}
          </div>
        )}
      </div>
    );
  };

  const RecipeSearchView = () => {
    const [searchQuery, setSearchQuery] = useState('');

    const filterData = {
      dietary: ['Vegetarian', 'Vegan', 'Keto', 'Paleo', 'Mediterranean', 'Whole30', 'Pescatarian'],
      allergies: ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Soy', 'Eggs', 'Fish'],
      cuisine: ['Italian', 'Asian', 'Mexican', 'Indian', 'Mediterranean', 'American', 'French', 'Thai', 'Japanese'],
      mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Appetizer', 'Side Dish'],
      cookTime: ['< 15min', '15-30min', '30min-1hr', '> 1hr'],
      difficulty: ['Easy', 'Medium', 'Hard'],
      special: ['Low-carb', 'High-protein', 'Low-sodium', 'Sugar-free', 'One-pot', 'Make-ahead', 'Freezer-friendly']
    };

    const toggleFilter = (category, item) => {
      setSelectedFilters(prev => ({
        ...prev,
        [category]: prev[category].includes(item)
          ? prev[category].filter(i => i !== item)
          : [...prev[category], item]
      }));
    };

    const clearAllFilters = () => {
      setSelectedFilters({
        dietary: [],
        allergies: [],
        cuisine: [],
        mealType: [],
        cookTime: [],
        difficulty: [],
        special: []
      });
    };

    const getTotalFilterCount = () => {
      return Object.values(selectedFilters).reduce((total, filters) => total + filters.length, 0);
    };

    const handleSearch = () => {
      setShowSearchView(false);
      // In a real app, this would trigger search with filters
    };

    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowSearchView(false)}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input 
                  placeholder="Search recipes..." 
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Filters</span>
              {getTotalFilterCount() > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {getTotalFilterCount()}
                </Badge>
              )}
            </div>
            <Button 
              variant="link" 
              size="sm" 
              onClick={clearAllFilters}
              className="text-xs"
            >
              Clear all
            </Button>
          </div>
        </div>

        {/* Filter Sections */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <SearchFilterSection
            title="Dietary Preferences"
            items={filterData.dietary}
            selectedItems={selectedFilters.dietary}
            onToggle={toggleFilter}
            category="dietary"
          />

          <SearchFilterSection
            title="Allergies & Restrictions"
            items={filterData.allergies}
            selectedItems={selectedFilters.allergies}
            onToggle={toggleFilter}
            category="allergies"
          />

          <SearchFilterSection
            title="Cuisine Type"
            items={filterData.cuisine}
            selectedItems={selectedFilters.cuisine}
            onToggle={toggleFilter}
            category="cuisine"
          />

          <SearchFilterSection
            title="Meal Type"
            items={filterData.mealType}
            selectedItems={selectedFilters.mealType}
            onToggle={toggleFilter}
            category="mealType"
          />

          <SearchFilterSection
            title="Cook Time"
            items={filterData.cookTime}
            selectedItems={selectedFilters.cookTime}
            onToggle={toggleFilter}
            category="cookTime"
          />

          <SearchFilterSection
            title="Difficulty"
            items={filterData.difficulty}
            selectedItems={selectedFilters.difficulty}
            onToggle={toggleFilter}
            category="difficulty"
          />

          <SearchFilterSection
            title="Special Diets"
            items={filterData.special}
            selectedItems={selectedFilters.special}
            onToggle={toggleFilter}
            category="special"
          />
        </div>

        {/* Search Button */}
        <div className="p-4 border-t">
          <Button 
            onClick={handleSearch}
            className="w-full bg-green-500 hover:bg-green-600"
          >
            <Search className="w-4 h-4 mr-2" />
            Search Recipes
            {getTotalFilterCount() > 0 && ` (${getTotalFilterCount()} filters)`}
          </Button>
        </div>

        <BottomTabBar activeTab="recipes" />
      </div>
    );
  };

  const MobileFrame = ({ children, title }) => (
    <div className="w-[390px] h-[844px] bg-white border border-gray-300 rounded-[24px] overflow-hidden mx-auto relative">
      {/* Status bar */}
      <div className="h-12 bg-white flex items-center justify-between px-6 text-sm">
        <span>9:41</span>
        <div className="flex gap-1">
          <div className="w-4 h-2 bg-black rounded-sm"></div>
          <div className="w-4 h-2 bg-black rounded-sm"></div>
          <div className="w-6 h-2 bg-black rounded-sm"></div>
        </div>
      </div>
      <div className="h-[calc(844px-48px)] overflow-auto">
        {children}
      </div>
    </div>
  );

  // Simplified ShoppingRow for brevity
  const ShoppingRow = ({ name, qty, category, checked }) => (
    <div className="flex items-center p-3 border-b border-gray-100">
      <div className="w-6 h-6 mr-3">
        {checked ? (
          <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-gray-300 rounded"></div>
        )}
      </div>
      <div className="flex-1">
        <div className={`${checked ? 'line-through text-gray-400' : ''}`}>
          {name}
        </div>
        <Badge variant="outline" className="text-xs mt-1">{category}</Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
          <Minus className="w-4 h-4" />
        </Button>
        <span className="text-sm w-8 text-center">{qty}</span>
        <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  // Frame Renderers
  const renderAuthFrame = () => (
    <div className="flex h-full flex-col">
      {authVariant === 'A' ? (
        <>
          {/* Header */}
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center">
              <ChefHat className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl mb-2">Pantry Pal</h1>
            <p className="text-gray-500">Manage your food inventory smart</p>
          </div>

          {/* Login Form */}
          <div className="flex-1 px-6">
            <div className="space-y-4 max-w-sm mx-auto">
              <div>
                <label className="block text-sm mb-2">Email</label>
                <Input placeholder="Enter your email" type="email" />
              </div>
              <div>
                <label className="block text-sm mb-2">Password</label>
                <div className="relative">
                  <Input placeholder="Enter your password" type="password" />
                  <Button variant="ghost" size="sm" className="absolute right-2 top-2 p-1">
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button className="w-full bg-green-500 hover:bg-green-600">
                Sign In
              </Button>
              <div className="flex items-center justify-between text-center">
                <Button variant="link" className="text-sm">
                  Forgot password?
                </Button>
                <Button variant="link" className="text-sm">
                  Create account
                </Button>
              </div>
            </div>
          </div>

          {/* Social Login */}
          <div className="px-6 mb-6">
            <div className="flex items-center max-w-sm mx-auto mb-6">
              <div className="flex-1 h-px bg-gray-300"></div>
              <span className="px-4 text-sm text-gray-500">or</span>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>
            
            <div className="space-y-3 max-w-sm mx-auto">
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-red-500 rounded mr-3 flex items-center justify-center text-white text-xs">G</div>
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-blue-600 rounded mr-3 flex items-center justify-center text-white text-xs">f</div>
                Continue with Facebook
              </Button>
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-black rounded mr-3 flex items-center justify-center text-white text-xs">🍎</div>
                Continue with Apple
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6">
          </div>
        </>
      ) : (
        <>
          {/* Social Login First */}
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center">
              <ChefHat className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl mb-2">Welcome to Pantry Pal</h1>
            <p className="text-gray-500 mb-8">Your smart food inventory companion</p>
            
            <div className="space-y-3 max-w-sm mx-auto">
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-red-500 rounded mr-3 flex items-center justify-center text-white text-xs">G</div>
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-blue-600 rounded mr-3 flex items-center justify-center text-white text-xs">f</div>
                Continue with Facebook
              </Button>
              <Button variant="outline" className="w-full">
                <div className="w-5 h-5 bg-black rounded mr-3 flex items-center justify-center text-white text-xs">🍎</div>
                Continue with Apple
              </Button>
            </div>
          </div>

          <div className="px-6">
            <div className="flex items-center max-w-sm mx-auto">
              <div className="flex-1 h-px bg-gray-300"></div>
              <span className="px-4 text-sm text-gray-500">or</span>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>
          </div>

          <div className="flex-1 p-6">
            <Button variant="outline" className="w-full max-w-sm mx-auto block">
              Sign in with Email
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const renderFridgeFrame = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl">Inventory</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Camera className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Tab-style filter buttons */}
        <div className="grid grid-cols-4 bg-gray-100 rounded-lg p-1 gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`text-xs ${activeInventoryCategory === 'all' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveInventoryCategory('all')}
          >
            All
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`text-xs ${activeInventoryCategory === 'fridge' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveInventoryCategory('fridge')}
          >
            Fridge
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`text-xs ${activeInventoryCategory === 'freezer' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveInventoryCategory('freezer')}
          >
            Freezer
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`text-xs ${activeInventoryCategory === 'pantry' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveInventoryCategory('pantry')}
          >
            Pantry
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by expiry date..." className="pl-10" />
          <div className="absolute right-3 top-3 flex gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <Menu className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Category Tags */}
      <div className="px-4 py-2 border-b">
        <div className="flex gap-2 items-center">
          {(() => {
            const filteredItems = getFilteredItems();
            const fruits = filteredItems.filter(item => ['apple', 'banana'].includes(item.type));
            const vegetables = filteredItems.filter(item => ['lettuce', 'broccoli', 'tomato'].includes(item.type));
            const proteins = filteredItems.filter(item => ['beef', 'chicken', 'eggs', 'shrimp'].includes(item.type));
            const expiringItems = filteredItems.filter(item => item.expiryDays <= 7);

            return (
              <>
                <div className="flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  {activeInventoryCategory === 'all' ? 'All' : activeInventoryCategory.charAt(0).toUpperCase() + activeInventoryCategory.slice(1)}
                  <Badge variant="secondary" className="text-xs">{filteredItems.length}</Badge>
                </div>
                <div className="flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">
                  🍎 Fruits
                  <Badge variant="outline" className="w-4 h-4 text-xs p-0 flex items-center justify-center">{fruits.length}</Badge>
                </div>
                <div className="flex items-center gap-2 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm">
                  🥬 Vegetables
                  <Badge variant="outline" className="w-4 h-4 text-xs p-0 flex items-center justify-center">{vegetables.length}</Badge>
                </div>
                <div className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                  🥩 Proteins
                  <Badge variant="outline" className="w-4 h-4 text-xs p-0 flex items-center justify-center">{proteins.length}</Badge>
                </div>
                {expiringItems.length > 0 && (
                  <div className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                    ⚠️ Expiring Soon
                    <Badge variant="destructive" className="w-4 h-4 text-xs p-0 flex items-center justify-center">{expiringItems.length}</Badge>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Inventory Content */}
      <div className="flex-1 overflow-auto">
        {fridgeVariant === 'A' ? (
          <div>
            {(() => {
              const groupedItems = getGroupedItems();
              
              if (activeInventoryCategory === 'all') {
                // Show all locations with section headers
                return (
                  <div>
                    {Object.entries(groupedItems).map(([location, items]) => (
                      items.length > 0 && (
                        <div key={location}>
                          <LocationSectionHeader location={location} count={items.length} />
                          <div>
                            {items.map((item, index) => (
                              <CuteFoodItem 
                                key={`${location}-${index}`}
                                type={item.type}
                                name={item.name}
                                quantity={item.quantity}
                                unit={item.unit}
                                expiryDays={item.expiryDays}
                                location={item.location}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                );
              } else {
                // Show only items from selected location
                const items = groupedItems[activeInventoryCategory] || [];
                return (
                  <div>
                    {items.length > 0 ? (
                      items.map((item, index) => (
                        <CuteFoodItem 
                          key={`${activeInventoryCategory}-${index}`}
                          type={item.type}
                          name={item.name}
                          quantity={item.quantity}
                          unit={item.unit}
                          expiryDays={item.expiryDays}
                          location={item.location}
                        />
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                          <div className="text-2xl">📦</div>
                        </div>
                        <h3 className="text-lg mb-2">No items in {activeInventoryCategory}</h3>
                        <p className="text-sm text-gray-500 mb-4">Add items to get started</p>
                        <Button variant="outline" size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Item
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            <ItemRow name="Milk (2%)" qty="1" unit="half gal" />
            <ItemRow name="Orange Juice" qty="1" unit="bottle" />
            <ItemRow name="Eggs" qty="3" unit="left" bad />
            <ItemRow name="Greek Yogurt" qty="2" unit="cups" />
            <ItemRow name="Cheddar Cheese" qty="1" unit="block" />
            <ItemRow name="Lettuce" qty="1" unit="head" />
            <ItemRow name="Carrots" qty="5" unit="pieces" />
            <ItemRow name="Leftover Pizza" qty="3" unit="slices" />
            <ItemRow name="Ketchup" qty="1" unit="bottle" />
            <ItemRow name="Apples" qty="4" unit="pieces" />
          </div>
        )}
      </div>

      <BottomTabBar activeTab="fridge" />
    </div>
  );



  const renderEditorFrame = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm">
            <X className="w-5 h-5" />
          </Button>
          <h1 className="text-lg">Edit Item</h1>
          <Button variant="ghost" size="sm" className="text-green-500">
            Save
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 p-4 space-y-6">
        {editorVariant === 'A' ? (
          <>
            {/* Item Photo */}
            <div className="text-center">
              <div className="w-32 h-32 bg-gray-200 rounded-lg mx-auto mb-3 flex items-center justify-center">
                <Camera className="w-8 h-8 text-gray-400" />
              </div>
              <Button variant="outline" size="sm">Add Photo</Button>
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Item Name</label>
                <Input placeholder="e.g., Organic Milk" defaultValue="Milk (2%)" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2">Quantity</label>
                  <Input placeholder="1" defaultValue="1" />
                </div>
                <div>
                  <label className="block text-sm mb-2">Unit</label>
                  <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer">
                    <span>half gallon</span>
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2">Location</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant="outline" 
                    className="flex flex-col p-3 h-auto bg-blue-50 border-blue-200 text-blue-700"
                  >
                    <div className="text-lg mb-1">❄️</div>
                    <span className="text-xs">Fridge</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex flex-col p-3 h-auto"
                  >
                    <div className="text-lg mb-1">🧊</div>
                    <span className="text-xs">Freezer</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex flex-col p-3 h-auto"
                  >
                    <div className="text-lg mb-1">🏺</div>
                    <span className="text-xs">Pantry</span>
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2">Expiry Date</label>
                <Input type="date" defaultValue="2024-12-25" />
              </div>

              <div>
                <label className="block text-sm mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="cursor-pointer">Dairy</Badge>
                  <Badge variant="secondary" className="cursor-pointer">Beverages</Badge>
                  <Badge variant="outline" className="cursor-pointer">Essential</Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-6 px-2 text-xs border-dashed"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Category
                  </Button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Popular: Protein, Vegetables, Fruits, Grains, Snacks
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Quick Edit Mode */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-sm mb-2 text-blue-700">Quick Edit Mode</h3>
              <p className="text-xs text-blue-600">Edit multiple similar items at once</p>
            </div>

            <div className="space-y-4">
              <ItemRow name="Milk (2%)" qty="1" unit="half gal" isEditing />
              <ItemRow name="Milk (Whole)" qty="1" unit="gallon" />
              <ItemRow name="Almond Milk" qty="1" unit="carton" />
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-3">Apply changes to:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Selected item only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" />
                    <span className="text-sm">All dairy products</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" />
                    <span className="text-sm">All items in Fridge</span>
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t">
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1">
            <X className="w-4 h-4 mr-2" />
            Delete
          </Button>
          <Button className="flex-1 bg-green-500 hover:bg-green-600">
            <Check className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );

  const renderReceiptFrame = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h1 className="text-xl">Receipt Capture</h1>
          <Button variant="outline" size="sm">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {receiptVariant === 'A' ? (
          <div className="p-4">
            {/* Camera View */}
            <div className="bg-gray-900 rounded-lg h-64 mb-4 relative overflow-hidden">
              <div className="absolute inset-4 border-2 border-white border-dashed rounded"></div>
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <Button size="lg" className="bg-white text-black hover:bg-gray-100 rounded-full w-16 h-16 p-0">
                  <Camera className="w-6 h-6" />
                </Button>
              </div>
              <div className="absolute top-4 left-4 text-white text-xs">
                Position receipt within frame
              </div>
            </div>

            {/* Instructions */}
            <Card className="mb-4">
              <CardContent className="p-4">
                <h3 className="text-sm mb-2">Tips for better scanning:</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Ensure good lighting</li>
                  <li>• Keep receipt flat and straight</li>
                  <li>• Include entire receipt in frame</li>
                  <li>• Avoid shadows and glare</li>
                </ul>
              </CardContent>
            </Card>

            {/* Recent Captures */}
            <div>
              <h3 className="text-sm mb-3">Recent Captures</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="aspect-square bg-gray-200 rounded border flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
                <div className="aspect-square bg-gray-200 rounded border flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
                <div className="aspect-square bg-gray-200 rounded border flex items-center justify-center cursor-pointer border-dashed">
                  <Plus className="w-6 h-6 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            {/* Processing View */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg mb-2">Receipt Scanned!</h2>
              <p className="text-sm text-gray-600">Processing items...</p>
              <Progress value={75} className="mt-4" />
            </div>

            {/* Detected Items Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Detected Items (8)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <span className="text-sm">Organic Milk</span>
                    <Badge variant="secondary" className="text-xs">Auto-added</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <span className="text-sm">Bananas</span>
                    <Badge variant="secondary" className="text-xs">Auto-added</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <span className="text-sm">Whole Wheat Bread</span>
                    <Badge variant="outline" className="text-xs">Needs review</Badge>
                  </div>
                  <div className="p-3 text-center">
                    <Button variant="link" size="sm">View all items</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <BottomTabBar />
    </div>
  );

  const renderQueueFrame = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl">Fix Queue</h1>
          <Badge variant="outline">3 items</Badge>
        </div>
        <p className="text-sm text-gray-600">Review and fix items that need attention</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {queueVariant === 'A' ? (
          <div className="space-y-4">
            <FixQueueCard 
              rawLine="org mlk 1gal $4.99"
              guess="Organic Milk"
              icChips={['Dairy', 'Beverages', 'Perishable']}
              attrChips={['1 gallon', '$4.99', 'Organic', 'Refrigerated']}
            />
            
            <FixQueueCard 
              rawLine="brd wht whl 1lf $3.49"
              guess="Whole Wheat Bread"
              icChips={['Bakery', 'Grains', 'Perishable']}
              attrChips={['1 loaf', '$3.49', 'Whole wheat', 'Sliced']}
            />
            
            <FixQueueCard 
              rawLine="tom org can 14oz $1.99"
              guess="Organic Diced Tomatoes"
              icChips={['Canned', 'Vegetables', 'Pantry']}
              attrChips={['14 oz', '$1.99', 'Organic', 'Diced']}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bulk Actions */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm mb-3">Bulk Actions</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Check className="w-4 h-4 mr-2" />
                    Accept All
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <X className="w-4 h-4 mr-2" />
                    Skip All
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Smart Suggestions */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm mb-3">Smart Suggestions</h3>
                <div className="space-y-2">
                  <div className="p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-700 mb-1">Pattern detected:</p>
                    <p className="text-xs text-blue-600">All "org" items seem to be "Organic" - apply to all?</p>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="text-xs">Apply</Button>
                      <Button variant="ghost" size="sm" className="text-xs">Skip</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Individual Items */}
            <div className="space-y-3">
              <FixQueueCard 
                rawLine="org mlk 1gal $4.99"
                guess="Organic Milk"
                icChips={['Dairy', 'Beverages']}
                attrChips={['1 gallon', '$4.99']}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1">
            Skip All
          </Button>
          <Button className="flex-1 bg-green-500 hover:bg-green-600">
            Process Queue
          </Button>
        </div>
      </div>

      <BottomTabBar />
    </div>
  );

  const renderShoppingFrame = () => {
    const [shoppingFilter, setShoppingFilter] = useState('all'); // 'all', 'completed', 'pending'
    const [groupByCategory, setGroupByCategory] = useState(true);

    const shoppingItems = [
      { name: "Organic Milk", qty: "1", unit: "half gal", category: "Dairy", checked: false },
      { name: "Whole Wheat Bread", qty: "1", unit: "loaf", category: "Bakery", checked: true },
      { name: "Bananas", qty: "6", unit: "pieces", category: "Produce", checked: false },
      { name: "Greek Yogurt", qty: "2", unit: "cups", category: "Dairy", checked: false },
      { name: "Olive Oil", qty: "1", unit: "bottle", category: "Pantry", checked: true },
      { name: "Ground Turkey", qty: "1", unit: "lb", category: "Meat", checked: false },
      { name: "Bell Peppers", qty: "3", unit: "pieces", category: "Produce", checked: false },
      { name: "Pasta", qty: "2", unit: "boxes", category: "Pantry", checked: false },
      { name: "Cheddar Cheese", qty: "1", unit: "block", category: "Dairy", checked: true }
    ];

    const getFilteredItems = () => {
      switch (shoppingFilter) {
        case 'completed':
          return shoppingItems.filter(item => item.checked);
        case 'pending':
          return shoppingItems.filter(item => !item.checked);
        default:
          return shoppingItems;
      }
    };

    const getGroupedItems = () => {
      const filtered = getFilteredItems();
      if (!groupByCategory) return { 'All Items': filtered };
      
      return filtered.reduce((groups, item) => {
        const category = item.category;
        if (!groups[category]) groups[category] = [];
        groups[category].push(item);
        return groups;
      }, {});
    };

    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl">Shopping List</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Share className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setGroupByCategory(!groupByCategory)}
              >
                {groupByCategory ? <Menu className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{shoppingItems.length} items</span>
              <span className="text-sm text-gray-400">•</span>
              <span className="text-sm text-gray-500">{shoppingItems.filter(i => i.checked).length} completed</span>
            </div>
            <div className="flex gap-1">
              <Button 
                variant={shoppingFilter === 'all' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setShoppingFilter('all')}
              >
                All
              </Button>
              <Button 
                variant={shoppingFilter === 'pending' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setShoppingFilter('pending')}
              >
                Pending
              </Button>
              <Button 
                variant={shoppingFilter === 'completed' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setShoppingFilter('completed')}
              >
                Done
              </Button>
            </div>
          </div>
        </div>

        {/* Add Item */}
        <div className="p-4 border-b">
          <Button variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>

        {/* Shopping List */}
        <div className="flex-1 overflow-auto">
          {shoppingVariant === 'A' ? (
            groupByCategory ? (
              <div>
                {Object.entries(getGroupedItems()).map(([category, items]) => (
                  items.length > 0 && (
                    <div key={category}>
                      <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm capitalize">{category}</h3>
                          <Badge variant="secondary" className="text-xs">{items.length} items</Badge>
                        </div>
                      </div>
                      <div>
                        {items.map((item, index) => (
                          <ShoppingRow 
                            key={`${category}-${index}`} 
                            name={item.name} 
                            qty={item.qty} 
                            category={item.category} 
                            checked={item.checked}
                          />
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            ) : (
              <div>
                {getFilteredItems().map((item, index) => (
                  <ShoppingRow 
                    key={index} 
                    name={item.name} 
                    qty={item.qty} 
                    category={item.category} 
                    checked={item.checked}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="p-4 space-y-4">
              {/* Smart Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Smart Suggestions</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                      <span className="text-sm">Milk expires in 2 days</span>
                      <Button variant="outline" size="sm">Add</Button>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                      <span className="text-sm">You're low on eggs</span>
                      <Button variant="outline" size="sm">Add</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Organized by Store Section */}
              <div className="space-y-3">
                <h3 className="text-sm">Organized by Store Section</h3>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-600">Produce</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ShoppingRow name="Bananas" qty="6" category="Produce" checked={false} />
                    <ShoppingRow name="Bell Peppers" qty="3" category="Produce" checked={false} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-600">Dairy</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ShoppingRow name="Organic Milk" qty="1" category="Dairy" checked={false} />
                    <ShoppingRow name="Greek Yogurt" qty="2" category="Dairy" checked={false} />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        <BottomTabBar activeTab="shopping" />
      </div>
    );
  };

  // Recipe Frame Renderers
  const renderRecipesDiscoverFrame = () => {
    if (showSearchView) {
      return <RecipeSearchView />;
    }

    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <h1 className="text-xl mb-4">Recipes</h1>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input 
              placeholder="Search recipes..." 
              className="pl-10 cursor-pointer" 
              onClick={() => setShowSearchView(true)}
              readOnly
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {recipesDiscoverVariant === 'A' ? (
            <>
              {/* Use-it-up Section */}
              <div className="p-4 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3>Use it up</h3>
                  <Badge variant="destructive" className="text-xs">Items expiring ≤72h</Badge>
                </div>
                <div className="flex overflow-x-auto pb-2">
                  <RecipeCard 
                    title="Quick Lettuce Wraps"
                    time={15}
                    servings="2-3"
                    matchPercent={85}
                    haveCount={4}
                    missingCount={1}
                    tags={['Asian', 'Light']}
                    isUseItUp={true}
                  />
                  <RecipeCard 
                    title="Carrot Ginger Soup"
                    time={25}
                    servings="4"
                    matchPercent={92}
                    haveCount={6}
                    missingCount={1}
                    tags={['Vegetarian', 'Healthy']}
                    isUseItUp={true}
                  />
                </div>
              </div>

              {/* High Match Section */}
              <div className="p-4 border-b">
                <h3 className="mb-3">High Match (≥70%)</h3>
                <div className="flex overflow-x-auto pb-2">
                  <RecipeCard 
                    title="Classic Pasta Carbonara"
                    time={20}
                    servings="4"
                    matchPercent={95}
                    haveCount={5}
                    missingCount={1}
                    tags={['Italian', 'Classic']}
                  />
                  <RecipeCard 
                    title="Veggie Fried Rice"
                    time={15}
                    servings="3-4"
                    matchPercent={87}
                    haveCount={7}
                    missingCount={2}
                    tags={['Asian', 'Vegetarian']}
                  />
                </div>
              </div>

              {/* Quick & Easy Section */}
              <div className="p-4">
                <h3 className="mb-3">Quick & Easy (&lt;30 min)</h3>
                <div className="flex overflow-x-auto pb-2">
                  <RecipeCard 
                    title="5-Minute Smoothie Bowl"
                    time={5}
                    servings="1"
                    matchPercent={65}
                    haveCount={3}
                    missingCount={2}
                    tags={['Breakfast', 'Healthy']}
                  />
                  <RecipeCard 
                    title="Avocado Toast Deluxe"
                    time={10}
                    servings="1-2"
                    matchPercent={58}
                    haveCount={2}
                    missingCount={3}
                    tags={['Breakfast', 'Quick']}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Empty states */}
              <div className="p-4 border-b">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3>Use it up</h3>
                  <Badge variant="destructive" className="text-xs">Items expiring ≤72h</Badge>
                </div>
                <Card className="p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                    <ChefHat className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm text-gray-500">No expiring items need recipes right now!</p>
                </Card>
              </div>
            </div>
          )}
        </div>

        <BottomTabBar activeTab="recipes" />
      </div>
    );
  };

  const renderRecipesResultsFrame = () => {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg">Recipe Results</h1>
              <p className="text-sm text-gray-500">24 recipes found</p>
            </div>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {recipesResultsVariant === 'A' ? (
          <>
            <FilterBar onlyHighMatch={onlyHighMatch} setOnlyHighMatch={setOnlyHighMatch} />
            
            {/* Results List */}
            <div className="flex-1 overflow-auto p-4">
              <RecipeCardVertical 
                title="Quick Lettuce Wraps"
                time={15}
                servings="2-3"
                matchPercent={95}
                haveCount={5}
                missingCount={1}
                tags={['Asian', 'Light']}
                isUseItUp={true}
              />
              <RecipeCardVertical 
                title="Classic Pasta Carbonara"
                time={20}
                servings="4"
                matchPercent={92}
                haveCount={7}
                missingCount={2}
                tags={['Italian', 'Classic']}
              />
              <RecipeCardVertical 
                title="Vegetable Stir Fry"
                time={15}
                servings="3-4"
                matchPercent={88}
                haveCount={6}
                missingCount={2}
                tags={['Asian', 'Vegetarian']}
              />
              <RecipeCardVertical 
                title="Chicken Caesar Salad"
                time={10}
                servings="2"
                matchPercent={75}
                haveCount={4}
                missingCount={3}
                tags={['Salad', 'Protein']}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 p-4">
            {/* No Results State */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg mb-2">No recipes found</h3>
                <p className="text-sm text-gray-500 mb-4">Try adjusting your filters or search terms</p>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full">
                    Clear all filters
                  </Button>
                  <Button variant="outline" className="w-full">
                    Suggest recipes for my pantry
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <BottomTabBar activeTab="recipes" />
      </div>
    );
  };

  const renderRecipeDetailFrame = () => {
    const haveIngredients = [
      { name: "Spaghetti pasta", amount: "1 lb" },
      { name: "Eggs", amount: "3 large" },
      { name: "Parmesan cheese", amount: "1 cup grated" },
      { name: "Black pepper", amount: "to taste" }
    ];

    const missingIngredients = [
      { name: "Pancetta", amount: "4 oz" },
      { name: "Heavy cream", amount: "1/2 cup" }
    ];

    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg">Classic Pasta Carbonara</h1>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>20 min</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>4 servings</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <Heart className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Share className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">95% match</Badge>
            <Badge variant="outline" className="text-xs">Italian</Badge>
            <Badge variant="outline" className="text-xs">Classic</Badge>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {recipeDetailVariant === 'A' ? (
            <div>
              {/* Recipe Image */}
              <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                <ChefHat className="w-12 h-12 text-gray-400" />
              </div>

              {/* Tabs */}
              <Tabs defaultValue="ingredients" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
                  <TabsTrigger value="instructions">Instructions</TabsTrigger>
                  <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
                </TabsList>
                
                <TabsContent value="ingredients" className="p-4">
                  <IngredientList 
                    haveIngredients={haveIngredients}
                    missingIngredients={missingIngredients}
                    onAddMissing={() => {}}
                  />
                </TabsContent>
                
                <TabsContent value="instructions" className="p-4">
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">1</div>
                      <p className="text-sm">Bring a large pot of salted water to boil for the pasta.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">2</div>
                      <p className="text-sm">Meanwhile, dice the pancetta and cook in a large skillet over medium heat until crispy.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">3</div>
                      <p className="text-sm">In a bowl, whisk together eggs, grated Parmesan, and black pepper.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">4</div>
                      <p className="text-sm">Cook pasta according to package directions. Reserve 1 cup pasta water before draining.</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="nutrition" className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-2xl mb-1">485</div>
                      <div className="text-xs text-gray-500">Calories</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-2xl mb-1">22g</div>
                      <div className="text-xs text-gray-500">Protein</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-2xl mb-1">45g</div>
                      <div className="text-xs text-gray-500">Carbs</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-2xl mb-1">28g</div>
                      <div className="text-xs text-gray-500">Fat</div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="p-4">
              {/* Cooking Mode */}
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-700">Cooking Mode Active</span>
                </div>
                <p className="text-xs text-green-600">Screen will stay on, larger text for easy reading</p>
              </div>

              {/* Current Step */}
              <Card className="mb-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500">Step 2 of 6</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-base mb-4">Meanwhile, dice the pancetta and cook in a large skillet over medium heat until crispy.</p>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">~5 minutes</span>
                  </div>
                </CardContent>
              </Card>

              {/* Timer */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Pasta cooking</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">8:42</span>
                      <Button variant="outline" size="sm">Stop</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button className="w-full bg-green-500 hover:bg-green-600">
            Start Cooking
          </Button>
        </div>

        <BottomTabBar activeTab="recipes" />
      </div>
    );
  };

  const renderRecipeImportFrame = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm">
            <X className="w-5 h-5" />
          </Button>
          <h1 className="text-lg">Import Recipe</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {recipeImportVariant === 'A' ? (
          <div>
            <ImportBar 
              url={importUrl}
              setUrl={setImportUrl}
              onImport={() => {}}
            />

            <div className="p-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <ExternalLink className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-lg mb-2">Import from URL</h2>
                <p className="text-sm text-gray-500">Paste a recipe URL from popular cooking sites</p>
              </div>

              {/* Supported Sites */}
              <div className="mb-6">
                <h3 className="text-sm mb-3">Supported sites:</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 border rounded text-center">
                    <div className="w-8 h-8 bg-red-500 rounded mx-auto mb-1"></div>
                    <span className="text-xs">AllRecipes</span>
                  </div>
                  <div className="p-2 border rounded text-center">
                    <div className="w-8 h-8 bg-green-500 rounded mx-auto mb-1"></div>
                    <span className="text-xs">Food Network</span>
                  </div>
                  <div className="p-2 border rounded text-center">
                    <div className="w-8 h-8 bg-blue-500 rounded mx-auto mb-1"></div>
                    <span className="text-xs">Bon Appétit</span>
                  </div>
                  <div className="p-2 border rounded text-center">
                    <div className="w-8 h-8 bg-orange-500 rounded mx-auto mb-1"></div>
                    <span className="text-xs">Serious Eats</span>
                  </div>
                </div>
              </div>

              {/* Alternative */}
              <div className="text-center">
                <div className="flex items-center mb-4">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="px-4 text-sm text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowGuidedCapture(true)}
                >
                  Enter recipe manually
                </Button>
              </div>
            </div>
          </div>
        ) : (
          showGuidedCapture ? (
            <GuidedCapture onSave={() => setShowGuidedCapture(false)} />
          ) : (
            <div className="p-4">
              {/* Success State */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-lg mb-2">Recipe Imported!</h2>
                <p className="text-sm text-gray-500">Classic Carbonara has been added to your recipes</p>
              </div>

              {/* Recipe Preview */}
              <Card className="mb-4">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                      <ChefHat className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-1">Classic Pasta Carbonara</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                        <span>20 min</span>
                        <span>4 servings</span>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">95% match</Badge>
                        <Badge variant="outline" className="text-xs">Italian</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="space-y-3">
                <Button className="w-full bg-green-500 hover:bg-green-600">
                  View Recipe
                </Button>
                <Button variant="outline" className="w-full">
                  Add ingredients to shopping list
                </Button>
                <Button variant="outline" className="w-full">
                  Import another recipe
                </Button>
              </div>
            </div>
          )
        )}
      </div>

      <BottomTabBar activeTab="recipes" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {/* Frame selector */}
      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        {frames.map(frame => (
          <Button 
            key={frame}
            variant={currentFrame === frame ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentFrame(frame)}
            className="capitalize"
          >
            {frame === 'fridge' ? 'Fridge' : 
             frame === 'editor' ? 'Item Editor' : 
             frame === 'receipt' ? 'Receipt Capture' : 
             frame === 'queue' ? 'Fix Queue' : 
             frame === 'shopping' ? 'Shopping List' : 
             frame === 'recipes-discover' ? 'Recipes - Discover' :
             frame === 'recipes-results' ? 'Recipes - Results' :
             frame === 'recipe-detail' ? 'Recipe Detail' :
             frame === 'recipe-import' ? 'Import (URL + Guided)' :
             frame === 'recipe-components' ? 'Recipe Components' :
             frame}
          </Button>
        ))}
      </div>

      {/* Variant toggles */}
      {currentFrame !== 'components' && currentFrame !== 'recipe-components' && (
        <div className="flex justify-center mb-8">
          <div className="flex gap-2">
            <Button 
              variant={
                (currentFrame === 'auth' && authVariant === 'A') ||
                (currentFrame === 'fridge' && fridgeVariant === 'A') ||
                (currentFrame === 'editor' && editorVariant === 'A') ||
                (currentFrame === 'receipt' && receiptVariant === 'A') ||
                (currentFrame === 'queue' && queueVariant === 'A') ||
                (currentFrame === 'shopping' && shoppingVariant === 'A') ||
                (currentFrame === 'recipes-discover' && recipesDiscoverVariant === 'A') ||
                (currentFrame === 'recipes-results' && recipesResultsVariant === 'A') ||
                (currentFrame === 'recipe-detail' && recipeDetailVariant === 'A') ||
                (currentFrame === 'recipe-import' && recipeImportVariant === 'A')
                ? "default" : "outline"
              }
              size="sm"
              onClick={() => {
                if (currentFrame === 'auth') setAuthVariant('A');
                if (currentFrame === 'fridge') setFridgeVariant('A');
                if (currentFrame === 'editor') setEditorVariant('A');
                if (currentFrame === 'receipt') setReceiptVariant('A');
                if (currentFrame === 'queue') setQueueVariant('A');
                if (currentFrame === 'shopping') setShoppingVariant('A');
                if (currentFrame === 'recipes-discover') setRecipesDiscoverVariant('A');
                if (currentFrame === 'recipes-results') setRecipesResultsVariant('A');
                if (currentFrame === 'recipe-detail') setRecipeDetailVariant('A');
                if (currentFrame === 'recipe-import') setRecipeImportVariant('A');
              }}
            >
              Variant A
            </Button>
            <Button 
              variant={
                (currentFrame === 'auth' && authVariant === 'B') ||
                (currentFrame === 'fridge' && fridgeVariant === 'B') ||
                (currentFrame === 'editor' && editorVariant === 'B') ||
                (currentFrame === 'receipt' && receiptVariant === 'B') ||
                (currentFrame === 'queue' && queueVariant === 'B') ||
                (currentFrame === 'shopping' && shoppingVariant === 'B') ||
                (currentFrame === 'recipes-discover' && recipesDiscoverVariant === 'B') ||
                (currentFrame === 'recipes-results' && recipesResultsVariant === 'B') ||
                (currentFrame === 'recipe-detail' && recipeDetailVariant === 'B') ||
                (currentFrame === 'recipe-import' && recipeImportVariant === 'B')
                ? "default" : "outline"
              }
              size="sm"
              onClick={() => {
                if (currentFrame === 'auth') setAuthVariant('B');
                if (currentFrame === 'fridge') setFridgeVariant('B');
                if (currentFrame === 'editor') setEditorVariant('B');
                if (currentFrame === 'receipt') setReceiptVariant('B');
                if (currentFrame === 'queue') setQueueVariant('B');
                if (currentFrame === 'shopping') setShoppingVariant('B');
                if (currentFrame === 'recipes-discover') setRecipesDiscoverVariant('B');
                if (currentFrame === 'recipes-results') setRecipesResultsVariant('B');
                if (currentFrame === 'recipe-detail') setRecipeDetailVariant('B');
                if (currentFrame === 'recipe-import') setRecipeImportVariant('B');
              }}
            >
              Variant B
            </Button>
          </div>
        </div>
      )}

      {/* Wireframe */}
      <div className="flex justify-center">
        <MobileFrame title={currentFrame}>
          {currentFrame === 'auth' && renderAuthFrame()}
          {currentFrame === 'fridge' && renderFridgeFrame()}
          {currentFrame === 'editor' && renderEditorFrame()}
          {currentFrame === 'receipt' && renderReceiptFrame()}
          {currentFrame === 'queue' && renderQueueFrame()}
          {currentFrame === 'shopping' && renderShoppingFrame()}
          {currentFrame === 'recipes-discover' && renderRecipesDiscoverFrame()}
          {currentFrame === 'recipes-results' && renderRecipesResultsFrame()}
          {currentFrame === 'recipe-detail' && renderRecipeDetailFrame()}
          {currentFrame === 'recipe-import' && renderRecipeImportFrame()}
          {currentFrame === 'recipe-components' && (
            <div className="p-4 space-y-4">
              <h2 className="text-lg">Recipe Components</h2>
              <div>
                <h3 className="mb-3">Search View</h3>
                <p className="text-sm text-gray-500 mb-3">Click the search input in Recipes - Discover to see the full search experience with filters.</p>
              </div>
              <div>
                <h3 className="mb-2">Recipe Cards</h3>
                <RecipeCard 
                  title="Sample Recipe"
                  time={25}
                  servings="4"
                  matchPercent={85}
                  haveCount={6}
                  missingCount={2}
                  tags={['Italian', 'Comfort']}
                />
              </div>
            </div>
          )}
        </MobileFrame>
      </div>
    </div>
  );
}