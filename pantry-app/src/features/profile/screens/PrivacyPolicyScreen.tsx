import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';

export const PrivacyPolicyScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.lastUpdated}>Last Updated: November 4, 2025</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          Pantry App collects and processes the following information to provide our services:
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Account Information:</Text> Email address, display name, and authentication credentials used to create and maintain your account.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Pantry Data:</Text> Items you add to your pantry inventory, including item names, quantities, locations (fridge/freezer/pantry), expiration dates, and purchase information.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Shopping Lists:</Text> Items you add to your shopping lists, including quantities and associated recipes.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Receipt Data:</Text> When you scan receipts, we collect and process images, store names, purchase dates, item names, quantities, and prices. Receipt images are processed using AI and then deleted from our servers.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Recipe Data:</Text> Recipes you save, view, or create, including ingredients, instructions, and your cooking history.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Usage Data:</Text> Information about how you use the app, including features accessed, search queries, and interaction patterns to improve our services.
        </Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>Device Information:</Text> Device type, operating system version, and app version for troubleshooting and compatibility purposes.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>We use your information to:</Text>
        <Text style={styles.bulletItem}>• Provide and maintain the Pantry App services</Text>
        <Text style={styles.bulletItem}>• Track your pantry inventory and expiration dates</Text>
        <Text style={styles.bulletItem}>• Process receipt images to extract purchase data</Text>
        <Text style={styles.bulletItem}>• Generate shopping lists and meal plans</Text>
        <Text style={styles.bulletItem}>• Recommend recipes based on your pantry items</Text>
        <Text style={styles.bulletItem}>• Calculate spending statistics and purchase history</Text>
        <Text style={styles.bulletItem}>• Send notifications about expiring items (if enabled)</Text>
        <Text style={styles.bulletItem}>• Improve our AI models and recommendation algorithms</Text>
        <Text style={styles.bulletItem}>• Provide customer support and respond to inquiries</Text>
        <Text style={styles.bulletItem}>• Detect and prevent fraud or abuse</Text>

        <Text style={styles.sectionTitle}>3. Data Storage and Security</Text>
        <Text style={styles.paragraph}>
          Your data is stored securely using Supabase, a PostgreSQL database service with enterprise-grade security. We implement:
        </Text>
        <Text style={styles.bulletItem}>• Encrypted data transmission (HTTPS/TLS)</Text>
        <Text style={styles.bulletItem}>• Row-level security policies to isolate household data</Text>
        <Text style={styles.bulletItem}>• Secure authentication using industry-standard protocols</Text>
        <Text style={styles.bulletItem}>• Regular security updates and monitoring</Text>
        <Text style={styles.bulletItem}>• Automated backups to prevent data loss</Text>
        <Text style={styles.paragraph}>
          Receipt images are temporarily processed through AI services (Google Gemini) and are not permanently stored on our servers.
        </Text>

        <Text style={styles.sectionTitle}>4. Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do not sell your personal information. We may share data with:
        </Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Household Members:</Text> Users you invite to your household can view shared pantry items, shopping lists, and recipes.</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Service Providers:</Text> We use third-party services including Supabase (data storage), Google Gemini (receipt OCR), and Expo (app infrastructure). These providers only access data necessary to perform their services.</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Legal Requirements:</Text> We may disclose information if required by law, court order, or to protect our rights and safety.</Text>

        <Text style={styles.sectionTitle}>5. Your Rights and Choices</Text>
        <Text style={styles.paragraph}>You have the right to:</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Access:</Text> View all your personal data stored in the app</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Modify:</Text> Edit or update your profile, pantry items, and preferences</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Delete:</Text> Permanently delete your account and all associated data using the "Delete My Account" feature in Profile settings</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Export:</Text> Request a copy of your data by contacting support</Text>
        <Text style={styles.bulletItem}>• <Text style={styles.bold}>Opt-Out:</Text> Disable notifications in app settings</Text>

        <Text style={styles.sectionTitle}>6. Data Retention</Text>
        <Text style={styles.paragraph}>
          We retain your data as long as your account is active. When you delete your account, all your personal data, including pantry items, recipes, shopping lists, receipts, and purchase history, is permanently deleted from our servers within 30 days.
        </Text>
        <Text style={styles.paragraph}>
          Receipt images are processed and deleted immediately after data extraction. We do not retain receipt images.
        </Text>

        <Text style={styles.sectionTitle}>7. Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Pantry App is not intended for children under 13. We do not knowingly collect personal information from children. If you believe we have collected data from a child, please contact us immediately.
        </Text>

        <Text style={styles.sectionTitle}>8. International Users</Text>
        <Text style={styles.paragraph}>
          Your data may be transferred to and processed in the United States and other countries where our service providers operate. By using Pantry App, you consent to this transfer.
        </Text>

        <Text style={styles.sectionTitle}>9. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy periodically. We will notify you of significant changes by updating the "Last Updated" date and, when appropriate, through in-app notifications.
        </Text>

        <Text style={styles.sectionTitle}>10. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions about this Privacy Policy or your data, contact us at:
        </Text>
        <Text style={styles.paragraph}>
          Email: support@pantryapp.com
        </Text>
        <Text style={styles.paragraph}>
          For data deletion requests or privacy concerns, please use the subject line "Privacy Request."
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Pantry App, you acknowledge that you have read and understood this Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
    color: '#111827',
  },
  bulletItem: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 8,
    paddingLeft: 8,
  },
  footer: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
