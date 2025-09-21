import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { LocationButton } from './LocationButton';

export type Location = 'fridge' | 'freezer' | 'pantry';

export interface LocationAssignments {
  [itemId: string]: Location | null;
}

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

interface LocationSelectorModalProps {
  visible: boolean;
  items: ShoppingItem[];
  onConfirm: (assignments: LocationAssignments) => void;
  onCancel: () => void;
}

export const LocationSelectorModal: React.FC<LocationSelectorModalProps> = ({
  visible,
  items,
  onConfirm,
  onCancel,
}) => {
  // Initialize all items with null (no location selected)
  const [assignments, setAssignments] = useState<LocationAssignments>(() =>
    items.reduce((acc, item) => ({ ...acc, [item.id]: null }), {})
  );

  // Check if all items have been assigned a location
  const allAssigned = useMemo(() => {
    return items.every(item => assignments[item.id] !== null);
  }, [items, assignments]);

  const handleLocationSelect = (itemId: string, location: Location) => {
    setAssignments(prev => ({
      ...prev,
      [itemId]: prev[itemId] === location ? null : location,
    }));
  };

  const handleConfirm = () => {
    if (allAssigned) {
      onConfirm(assignments);
    }
  };

  const renderItem = ({ item }: { item: ShoppingItem }) => {
    const selectedLocation = assignments[item.id];

    return (
      <View style={styles.itemRow}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>
            {item.name}
            {item.quantity > 1 && (
              <Text style={styles.itemQuantity}> ({item.quantity})</Text>
            )}
          </Text>
        </View>
        <View style={styles.locationButtons}>
          <LocationButton
            icon="❄️"
            isSelected={selectedLocation === 'fridge'}
            onPress={() => handleLocationSelect(item.id, 'fridge')}
          />
          <LocationButton
            icon="🧊"
            isSelected={selectedLocation === 'freezer'}
            onPress={() => handleLocationSelect(item.id, 'freezer')}
          />
          <LocationButton
            icon="🗄️"
            isSelected={selectedLocation === 'pantry'}
            onPress={() => handleLocationSelect(item.id, 'pantry')}
          />
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Assign Storage Locations</Text>
            <Text style={styles.subtitle}>Tap to select where each item goes</Text>
          </View>

          <FlatList
            data={items}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmButton,
                !allAssigned && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!allAssigned}
            >
              <Text
                style={[
                  styles.confirmButtonText,
                  !allAssigned && styles.confirmButtonTextDisabled,
                ]}
              >
                Move to Inventory
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
  listContent: {
    paddingVertical: theme.spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  itemQuantity: {
    color: theme.colors.textLight,
  },
  locationButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.button,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...theme.typography.button,
    color: theme.colors.text,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.button,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  confirmButtonText: {
    ...theme.typography.button,
    color: '#FFFFFF',
  },
  confirmButtonTextDisabled: {
    color: theme.colors.textLight,
  },
});