import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';

export const TermsOfServiceScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.lastUpdated}>Last Updated: November 4, 2025</Text>

        <Text style={styles.paragraph}>
          Welcome to Pantry App. By using our application, you agree to these Terms of Service. Please read them carefully.
        </Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By creating an account or using Pantry App, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, please do not use the app.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          Pantry App provides a digital pantry management solution that allows you to:
        </Text>
        <Text style={styles.bulletItem}>• Track food inventory and expiration dates</Text>
        <Text style={styles.bulletItem}>• Scan and process grocery receipts</Text>
        <Text style={styles.bulletItem}>• Create and manage shopping lists</Text>
        <Text style={styles.bulletItem}>• Discover and save recipes</Text>
        <Text style={styles.bulletItem}>• Plan meals based on available ingredients</Text>
        <Text style={styles.bulletItem}>• Track purchase history and spending</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify, suspend, or discontinue any feature at any time without prior notice.
        </Text>

        <Text style={styles.sectionTitle}>3. Account Registration</Text>
        <Text style={styles.paragraph}>
          To use Pantry App, you must create an account with a valid email address. You agree to:
        </Text>
        <Text style={styles.bulletItem}>• Provide accurate and complete information</Text>
        <Text style={styles.bulletItem}>• Maintain the security of your account credentials</Text>
        <Text style={styles.bulletItem}>• Notify us immediately of any unauthorized access</Text>
        <Text style={styles.bulletItem}>• Be responsible for all activity under your account</Text>
        <Text style={styles.paragraph}>
          You must be at least 13 years old to create an account. Accounts are for personal, non-commercial use only.
        </Text>

        <Text style={styles.sectionTitle}>4. User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of content you create in the app (pantry items, recipes, lists, etc.). By using the app, you grant us a license to:
        </Text>
        <Text style={styles.bulletItem}>• Store and process your content to provide the service</Text>
        <Text style={styles.bulletItem}>• Use aggregated, anonymized data to improve our services</Text>
        <Text style={styles.bulletItem}>• Display your content to household members you invite</Text>
        <Text style={styles.paragraph}>
          You are responsible for your content and must not upload anything that:
        </Text>
        <Text style={styles.bulletItem}>• Infringes on intellectual property rights</Text>
        <Text style={styles.bulletItem}>• Contains malicious code or viruses</Text>
        <Text style={styles.bulletItem}>• Violates any laws or regulations</Text>
        <Text style={styles.bulletItem}>• Contains offensive or harmful material</Text>

        <Text style={styles.sectionTitle}>5. Receipt Scanning and OCR</Text>
        <Text style={styles.paragraph}>
          Our receipt scanning feature uses optical character recognition (OCR) and AI to extract purchase data. You acknowledge that:
        </Text>
        <Text style={styles.bulletItem}>• OCR accuracy may vary depending on receipt quality</Text>
        <Text style={styles.bulletItem}>• You should verify extracted data for accuracy</Text>
        <Text style={styles.bulletItem}>• Receipt images are processed and then deleted</Text>
        <Text style={styles.bulletItem}>• We are not responsible for errors in extracted data</Text>

        <Text style={styles.sectionTitle}>6. Recipe Data and Third-Party Content</Text>
        <Text style={styles.paragraph}>
          Recipes in Pantry App may come from various sources including user submissions and third-party platforms. We do not guarantee:
        </Text>
        <Text style={styles.bulletItem}>• Accuracy of nutritional information</Text>
        <Text style={styles.bulletItem}>• Safety or quality of recipes</Text>
        <Text style={styles.bulletItem}>• Suitability for dietary restrictions or allergies</Text>
        <Text style={styles.paragraph}>
          Always use your own judgment when preparing food. We are not liable for any health issues resulting from recipes or food safety decisions.
        </Text>

        <Text style={styles.sectionTitle}>7. Household Sharing</Text>
        <Text style={styles.paragraph}>
          You may invite others to join your household. By doing so:
        </Text>
        <Text style={styles.bulletItem}>• Household members can view and edit shared data</Text>
        <Text style={styles.bulletItem}>• You are responsible for managing household access</Text>
        <Text style={styles.bulletItem}>• You must have permission to share data with others</Text>
        <Text style={styles.bulletItem}>• Household members must comply with these Terms</Text>

        <Text style={styles.sectionTitle}>8. Prohibited Uses</Text>
        <Text style={styles.paragraph}>You may not:</Text>
        <Text style={styles.bulletItem}>• Use the app for any illegal purpose</Text>
        <Text style={styles.bulletItem}>• Attempt to reverse engineer or hack the app</Text>
        <Text style={styles.bulletItem}>• Use automated scripts or bots</Text>
        <Text style={styles.bulletItem}>• Interfere with the app's operation</Text>
        <Text style={styles.bulletItem}>• Impersonate others or create fake accounts</Text>
        <Text style={styles.bulletItem}>• Collect user data without permission</Text>
        <Text style={styles.bulletItem}>• Use the app for commercial purposes without authorization</Text>

        <Text style={styles.sectionTitle}>9. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          Pantry App, including its design, features, algorithms, and code, is owned by us and protected by copyright and other intellectual property laws. You may not:
        </Text>
        <Text style={styles.bulletItem}>• Copy, modify, or distribute the app</Text>
        <Text style={styles.bulletItem}>• Remove copyright or trademark notices</Text>
        <Text style={styles.bulletItem}>• Use our branding without permission</Text>

        <Text style={styles.sectionTitle}>10. Disclaimers and Limitations of Liability</Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.</Text> We do not guarantee that the app will be:
        </Text>
        <Text style={styles.bulletItem}>• Error-free or uninterrupted</Text>
        <Text style={styles.bulletItem}>• Secure from unauthorized access</Text>
        <Text style={styles.bulletItem}>• Free from bugs or technical issues</Text>
        <Text style={styles.bulletItem}>• Compatible with all devices</Text>
        <Text style={styles.paragraph}>
          <Text style={styles.bold}>TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR:</Text>
        </Text>
        <Text style={styles.bulletItem}>• Loss of data or content</Text>
        <Text style={styles.bulletItem}>• Food safety issues or health problems</Text>
        <Text style={styles.bulletItem}>• Financial losses from incorrect spending data</Text>
        <Text style={styles.bulletItem}>• Indirect, incidental, or consequential damages</Text>
        <Text style={styles.paragraph}>
          Your sole remedy for dissatisfaction is to stop using the app and delete your account.
        </Text>

        <Text style={styles.sectionTitle}>11. Indemnification</Text>
        <Text style={styles.paragraph}>
          You agree to indemnify and hold us harmless from any claims, damages, or expenses arising from:
        </Text>
        <Text style={styles.bulletItem}>• Your use of the app</Text>
        <Text style={styles.bulletItem}>• Violation of these Terms</Text>
        <Text style={styles.bulletItem}>• Infringement of third-party rights</Text>
        <Text style={styles.bulletItem}>• Your content or actions</Text>

        <Text style={styles.sectionTitle}>12. Termination</Text>
        <Text style={styles.paragraph}>
          We may suspend or terminate your account at any time for:
        </Text>
        <Text style={styles.bulletItem}>• Violation of these Terms</Text>
        <Text style={styles.bulletItem}>• Fraudulent or abusive behavior</Text>
        <Text style={styles.bulletItem}>• Extended periods of inactivity</Text>
        <Text style={styles.bulletItem}>• Legal or regulatory requirements</Text>
        <Text style={styles.paragraph}>
          You may delete your account at any time using the "Delete My Account" feature in Profile settings. Upon deletion, all your data will be permanently removed within 30 days.
        </Text>

        <Text style={styles.sectionTitle}>13. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms of Service at any time. We will notify you of material changes by:
        </Text>
        <Text style={styles.bulletItem}>• Updating the "Last Updated" date</Text>
        <Text style={styles.bulletItem}>• Sending an in-app notification</Text>
        <Text style={styles.bulletItem}>• Requiring acceptance of new terms</Text>
        <Text style={styles.paragraph}>
          Continued use of the app after changes constitutes acceptance of the new terms.
        </Text>

        <Text style={styles.sectionTitle}>14. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms are governed by the laws of the United States and the State of California, without regard to conflict of law principles. Any disputes will be resolved in the courts of California.
        </Text>

        <Text style={styles.sectionTitle}>15. Severability</Text>
        <Text style={styles.paragraph}>
          If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.
        </Text>

        <Text style={styles.sectionTitle}>16. Contact Information</Text>
        <Text style={styles.paragraph}>
          For questions about these Terms, contact us at:
        </Text>
        <Text style={styles.paragraph}>
          Email: support@pantryapp.com
        </Text>
        <Text style={styles.paragraph}>
          Subject: Terms of Service Inquiry
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Pantry App, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
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
