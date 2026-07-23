
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Platform,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { authenticatedDelete } from '@/utils/api';

import { log, warn, error as logError } from '@/utils/log';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  emailVerified: boolean;
  image: string | null;
  imageUrl: string | null;
  created_at: string;
  createdAt: string;
  updatedAt: string;
  address?: string | null;
  tel_no?: string | null;
  date_of_birth?: string | null;
  srb_no?: string | null;
  nationality?: string | null;
  pya_membership_no?: string | null;
  department?: string | null;
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 16,
      paddingTop: Platform.OS === 'android' ? 48 : 16,
      paddingBottom: 100,
    },
    header: {
      marginBottom: 24,
      alignItems: 'center',
    },
    profileImageContainer: {
      position: 'relative',
      marginBottom: 16,
    },
    profileImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
    },
    profileImagePlaceholder: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editImageButton: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: isDark ? colors.background : colors.backgroundLight,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      marginTop: 8,
    },
    profileCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    profileRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    profileRowLast: {
      borderBottomWidth: 0,
    },
    profileLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    profileValue: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    profileValueEmpty: {
      fontSize: 16,
      fontStyle: 'italic',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    secondaryButtonText: {
      color: colors.primary,
    },
    signOutButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: colors.error,
    },
    signOutButtonText: {
      color: colors.error,
    },
    deleteAccountButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.error,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    deleteAccountButtonText: {
      color: colors.error,
      fontSize: 16,
      fontWeight: '600',
    },
    warningBox: {
      backgroundColor: colors.error + '15',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    warningText: {
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
      fontWeight: '600',
    },
    emptyStateText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      marginTop: 12,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 24,
      width: '90%',
      maxWidth: 500,
      maxHeight: '90%',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 20,
      textAlign: 'center',
    },
    modalScrollContent: {
      paddingBottom: 20,
    },
    input: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    dateButton: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dateButtonText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    dateButtonPlaceholder: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    modalButton: {
      flex: 1,
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    modalButtonPrimary: {
      backgroundColor: colors.primary,
    },
    modalButtonSecondary: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    modalButtonTextSecondary: {
      color: isDark ? colors.text : colors.textLight,
    },
    loadingContainer: {
      padding: 20,
      alignItems: 'center',
    },
    infoBox: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    departmentButton: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    departmentButtonSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primary + '10',
    },
    departmentButtonText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      textAlign: 'center',
      fontWeight: '500',
    },
    departmentButtonsContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    departmentButtonSmall: {
      flex: 1,
    },
    imagePickerModal: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 20,
      width: '90%',
      maxWidth: 400,
    },
    imagePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    imagePickerButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginLeft: 12,
      flex: 1,
    },
  });
}

export default function UserProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const { user, signOut, triggerRefresh } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [imagePickerModalVisible, setImagePickerModalVisible] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info';
    onConfirm?: () => void;
  }>({ visible: false, title: '', message: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const showFeedback = (title: string, message: string, type: 'error' | 'success' | 'info' = 'info', onConfirm?: () => void) => {
    setFeedbackModal({ visible: true, title, message, type, onConfirm });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ visible: true, title, message, onConfirm });
  };
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editTelNo, setEditTelNo] = useState('');
  const [editDateOfBirth, setEditDateOfBirth] = useState<Date | null>(null);
  const [editSrbNo, setEditSrbNo] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editPyaMembershipNo, setEditPyaMembershipNo] = useState('');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    log('User viewing User Profile screen');
    try {
      setLoading(true);
      
      const profileData = await seaTimeApi.getUserProfile();
      
      log('Profile loaded:', profileData.email);
      
      setProfile(profileData);
    } catch (error: any) {
      logError('Failed to load profile data:', error);
      showFeedback(t('common.error'), error.message || 'Failed to load profile data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProfile = () => {
    log('User tapped Edit Profile button');
    if (profile) {
      setEditName(profile.name);
      setEditEmail(profile.email);
      setEditAddress(profile.address || '');
      setEditTelNo(profile.tel_no || '');
      setEditDateOfBirth(profile.date_of_birth ? new Date(profile.date_of_birth) : null);
      setEditSrbNo(profile.srb_no || '');
      setEditNationality(profile.nationality || '');
      setEditPyaMembershipNo(profile.pya_membership_no || '');
      // Capitalize for display in UI
      const displayDepartment = profile.department ? profile.department.charAt(0).toUpperCase() + profile.department.slice(1) : '';
      setEditDepartment(displayDepartment);
      setEditModalVisible(true);
    }
  };

  const handleSaveProfile = async () => {
    log('User saving profile changes');
    try {
      const updates: any = {};
      
      if (editName !== profile?.name) updates.name = editName;
      if (editEmail !== profile?.email) updates.email = editEmail;
      if (editAddress !== (profile?.address || '')) updates.address = editAddress || null;
      if (editTelNo !== (profile?.tel_no || '')) updates.tel_no = editTelNo || null;
      const currentDob = profile?.date_of_birth || null;
      const newDob = editDateOfBirth ? editDateOfBirth.toISOString().split('T')[0] : null;
      if (newDob !== currentDob) {
        updates.date_of_birth = newDob;
      }
      if (editSrbNo !== (profile?.srb_no || '')) updates.srb_no = editSrbNo || null;
      if (editNationality !== (profile?.nationality || '')) updates.nationality = editNationality || null;
      if (editPyaMembershipNo !== (profile?.pya_membership_no || '')) updates.pya_membership_no = editPyaMembershipNo || null;
      
      // Convert department to lowercase for backend
      const currentDepartment = profile?.department ? profile.department.charAt(0).toUpperCase() + profile.department.slice(1) : '';
      if (editDepartment !== currentDepartment) {
        updates.department = editDepartment ? editDepartment.toLowerCase() : null;
        log('Department changed from', currentDepartment, 'to', editDepartment, '(backend value:', updates.department, ')');
      }
      
      if (Object.keys(updates).length === 0) {
        setEditModalVisible(false);
        return;
      }
      
      log('Updating profile with:', updates);
      const updatedProfile = await seaTimeApi.updateUserProfile(updates);
      log('Profile updated successfully');
      setProfile(updatedProfile);
      setEditModalVisible(false);
      
      // If department was changed, trigger global refresh to update all screens
      if (updates.department !== undefined) {
        log('Department was changed, triggering global refresh to update all screens');
        triggerRefresh();
      }
      
      showFeedback(t('common.success'), 'Profile updated successfully', 'success');
    } catch (error: any) {
      logError('Failed to update profile:', error);
      showFeedback(t('common.error'), error.message || 'Failed to update profile', 'error');
    }
  };

  const handleChangeProfilePicture = () => {
    log('User tapped Change Profile Picture button');
    setImagePickerModalVisible(true);
  };

  const handlePickFromLibrary = async () => {
    log('User chose to pick from photo library');
    setImagePickerModalVisible(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showFeedback('Permission Required', 'Please grant permission to access your photos', 'info');
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      log('Image selected from library:', imageUri);
      await uploadImage(imageUri);
    }
  };

  const handleTakePhoto = async () => {
    log('User chose to take a photo');
    setImagePickerModalVisible(false);
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showFeedback('Permission Required', 'Please grant permission to access your camera', 'info');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      log('Photo taken:', imageUri);
      await uploadImage(imageUri);
    }
  };

  const uploadImage = async (imageUri: string) => {
    setUploading(true);
    try {
      log('Uploading image:', imageUri);
      const response = await seaTimeApi.uploadProfileImage(imageUri);
      log('Profile image uploaded:', response.imageUrl);
      
      const updatedProfile = await seaTimeApi.getUserProfile();
      setProfile(updatedProfile);
      
      showFeedback(t('common.success'), 'Profile picture updated successfully', 'success');
    } catch (error: any) {
      logError('Failed to upload profile image:', error);
      showFeedback(t('common.error'), error.message || 'Failed to upload profile picture', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = () => {
    log('User tapped Sign Out button');
    showConfirm(
      t('signOut.title'),
      t('signOut.confirmation'),
      async () => {
        log('User confirmed sign out, executing sign out...');
        try {
          await signOut();
          log('Sign out completed successfully, navigating to auth screen');
          router.replace('/auth');
        } catch (error: any) {
          logError('Sign out failed with error:', error);
          showFeedback(t('common.error'), error.message || 'Failed to sign out. Please try again.', 'error');
        }
      }
    );
  };

  const handleDeleteAccount = () => {
    log('User tapped Delete Account button');
    setShowDeleteAccountModal(true);
  };

  const confirmDeleteAccount = async () => {
    log('User confirmed account deletion in modal');
    setDeletingAccount(true);
    try {
      log('[API] Requesting DELETE /api/users/me...');
      await authenticatedDelete('/api/users/me');
      log('Account deleted successfully (204 No Content)');
      setShowDeleteAccountModal(false);
      
      // Sign out locally - session is already invalidated on server
      try {
        await signOut();
        log('User signed out after account deletion');
        router.replace('/auth');
      } catch (signOutError) {
        // Ignore sign out errors - account is already deleted
        warn('Sign out after deletion failed (expected):', signOutError);
        router.replace('/auth');
      }
    } catch (error: any) {
      logError('Account deletion error:', error);
      setShowDeleteAccountModal(false);
      showFeedback(t('deleteAccount.failed'), `Failed to delete account. ${error?.message || 'Please try again or contact support if the issue persists.'}`, 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

  const cancelDeleteAccount = () => {
    log('User cancelled account deletion');
    setShowDeleteAccountModal(false);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format department for display (capitalize first letter)
  const formatDepartment = (dept: string | null | undefined) => {
    if (!dept) return 'Not set';
    return dept.charAt(0).toUpperCase() + dept.slice(1);
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'User Profile',
            headerShown: true,
            headerBackTitle: t('common.back'),
          }}
        />
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.emptyStateText}>Loading profile...</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'User Profile',
          headerShown: true,
          headerBackTitle: t('common.back'),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.profileImageContainer}>
            {uploading ? (
              <View style={styles.profileImagePlaceholder}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (() => {
              // Construct full image URL from relative path
              const imageUrl = profile?.imageUrl || (profile?.image ? `${seaTimeApi.API_BASE_URL}/${profile.image}` : null);
              log('User profile image URL:', imageUrl);
              return imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <IconSymbol
                    ios_icon_name="person.circle.fill"
                    android_material_icon_name="account-circle"
                    size={80}
                    color={colors.primary}
                  />
                </View>
              );
            })()}
            <TouchableOpacity 
              style={styles.editImageButton}
              onPress={handleChangeProfilePicture}
              disabled={uploading}
            >
              <IconSymbol
                ios_icon_name="camera.fill"
                android_material_icon_name="camera"
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>{profile?.name || 'Seafarer'}</Text>
          <Text style={styles.subtitle}>{profile?.email}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Complete your profile for MCA-compliant sea service testimonials. All fields are used in official PDF reports.
          </Text>
        </View>

        {profile && (
          <>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Full Name</Text>
                <Text style={styles.profileValue}>{profile.name}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Email Address</Text>
                <Text style={styles.profileValue}>{profile.email}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Address</Text>
                <Text style={profile.address ? styles.profileValue : styles.profileValueEmpty}>
                  {profile.address || 'Not set'}
                </Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Telephone Number</Text>
                <Text style={profile.tel_no ? styles.profileValue : styles.profileValueEmpty}>
                  {profile.tel_no || 'Not set'}
                </Text>
              </View>
              <View style={[styles.profileRow, styles.profileRowLast]}>
                <Text style={styles.profileLabel}>Date of Birth</Text>
                <Text style={profile.date_of_birth ? styles.profileValue : styles.profileValueEmpty}>
                  {formatDate(profile.date_of_birth)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Sea Time Pathway</Text>
            <View style={styles.profileCard}>
              <View style={[styles.profileRow, styles.profileRowLast]}>
                <Text style={styles.profileLabel}>Department</Text>
                <Text style={profile.department ? styles.profileValue : styles.profileValueEmpty}>
                  {formatDepartment(profile.department)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Maritime Credentials</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>SRB No. (Seafarers Registration Book)</Text>
                <Text style={profile.srb_no ? styles.profileValue : styles.profileValueEmpty}>
                  {profile.srb_no || 'Not set'}
                </Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Nationality</Text>
                <Text style={profile.nationality ? styles.profileValue : styles.profileValueEmpty}>
                  {profile.nationality || 'Not set'}
                </Text>
              </View>
              <View style={[styles.profileRow, styles.profileRowLast]}>
                <Text style={styles.profileLabel}>PYA Membership No.</Text>
                <Text style={profile.pya_membership_no ? styles.profileValue : styles.profileValueEmpty}>
                  {profile.pya_membership_no || 'Not set'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.profileCard}>
              <View style={[styles.profileRow, styles.profileRowLast]}>
                <Text style={styles.profileLabel}>Member Since</Text>
                <Text style={styles.profileValue}>{formatDate(profile.createdAt || profile.created_at)}</Text>
              </View>
            </View>
          </>
        )}

        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]} 
          onPress={handleEditProfile}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t('settings.editProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.signOutButton]} 
          onPress={handleSignOut}
        >
          <Text style={[styles.buttonText, styles.signOutButtonText]}>{t('signOut.title')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteAccountButton} 
          onPress={handleDeleteAccount}
        >
          <Text style={styles.deleteAccountButtonText}>{t('deleteAccount.title')}</Text>
        </TouchableOpacity>

        {/* Image Picker Modal */}
        <Modal
          visible={imagePickerModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImagePickerModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.imagePickerModal}>
              <Text style={styles.modalTitle}>Change Profile Picture</Text>
              
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={handlePickFromLibrary}
              >
                <IconSymbol
                  ios_icon_name="photo.fill"
                  android_material_icon_name="photo"
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.imagePickerButtonText}>Choose from Library</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={handleTakePhoto}
              >
                <IconSymbol
                  ios_icon_name="camera.fill"
                  android_material_icon_name="camera"
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.imagePickerButtonText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                // flex:undefined + full width: modalButton's `flex: 1` is for row layouts;
                // standalone it collapses height and the label never renders.
                style={[styles.modalButton, styles.modalButtonSecondary, { marginTop: 12, flex: undefined, width: '100%' }]}
                onPress={() => setImagePickerModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Feedback Modal - replaces Alert.alert() for web compatibility */}
        <Modal
          visible={feedbackModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            const onConfirm = feedbackModal.onConfirm;
            setFeedbackModal(prev => ({ ...prev, visible: false, onConfirm: undefined }));
            if (onConfirm) onConfirm();
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: undefined }]}>
              <Text style={[styles.modalTitle, {
                color: feedbackModal.type === 'error' ? colors.error : feedbackModal.type === 'success' ? colors.primary : (isDark ? colors.text : colors.textLight)
              }]}>
                {feedbackModal.title}
              </Text>
              <Text style={{ fontSize: 16, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 24, textAlign: 'center', lineHeight: 24 }}>
                {feedbackModal.message}
              </Text>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, {
                  backgroundColor: feedbackModal.type === 'error' ? colors.error : colors.primary,
                  // standalone in a column modal — see note above
                  flex: undefined,
                  width: '100%',
                }]}
                onPress={() => {
                  const onConfirm = feedbackModal.onConfirm;
                  setFeedbackModal(prev => ({ ...prev, visible: false, onConfirm: undefined }));
                  if (onConfirm) onConfirm();
                }}
              >
                <Text style={styles.modalButtonText}>{t('common.ok')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Confirm Modal - replaces Alert.alert() with destructive actions */}
        <Modal
          visible={confirmModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: undefined }]}>
              <Text style={styles.modalTitle}>{confirmModal.title}</Text>
              <Text style={{ fontSize: 16, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 24, textAlign: 'center', lineHeight: 24 }}>
                {confirmModal.message}
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => {
                    log('User cancelled confirmation');
                    setConfirmModal(prev => ({ ...prev, visible: false }));
                  }}
                >
                  <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: colors.error }]}
                  onPress={() => {
                    const onConfirm = confirmModal.onConfirm;
                    setConfirmModal(prev => ({ ...prev, visible: false }));
                    onConfirm();
                  }}
                >
                  <Text style={styles.modalButtonText}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('settings.editProfile')}</Text>
              
              <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.profileLabel}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editName}
                  onChangeText={setEditName}
                />
                
                <Text style={styles.profileLabel}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                
                <Text style={styles.profileLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Full Address"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editAddress}
                  onChangeText={setEditAddress}
                  multiline
                  numberOfLines={3}
                />
                
                <Text style={styles.profileLabel}>Telephone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+44 1234 567890"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editTelNo}
                  onChangeText={setEditTelNo}
                  keyboardType="phone-pad"
                />
                
                <Text style={styles.profileLabel}>Date of Birth</Text>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={editDateOfBirth ? styles.dateButtonText : styles.dateButtonPlaceholder}>
                    {editDateOfBirth ? formatDate(editDateOfBirth.toISOString()) : 'Select Date'}
                  </Text>
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="calendar-today"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                
                {showDatePicker && (
                  <DateTimePicker
                    value={editDateOfBirth || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (selectedDate) {
                        setEditDateOfBirth(selectedDate);
                      }
                    }}
                    maximumDate={new Date()}
                  />
                )}
                
                <Text style={styles.profileLabel}>SRB No. (Seafarers Registration Book)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="SRB Number"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editSrbNo}
                  onChangeText={setEditSrbNo}
                />
                
                <Text style={styles.profileLabel}>Nationality</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., British"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editNationality}
                  onChangeText={setEditNationality}
                />
                
                <Text style={styles.profileLabel}>PYA Membership No.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="PYA Membership Number"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  value={editPyaMembershipNo}
                  onChangeText={setEditPyaMembershipNo}
                />
                
                <Text style={styles.profileLabel}>Sea Time Pathway *</Text>
                <View style={styles.departmentButtonsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.departmentButton,
                      styles.departmentButtonSmall,
                      editDepartment === 'Deck' && styles.departmentButtonSelected,
                    ]}
                    onPress={() => setEditDepartment('Deck')}
                  >
                    <Text style={styles.departmentButtonText}>Deck</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.departmentButton,
                      styles.departmentButtonSmall,
                      editDepartment === 'Engineering' && styles.departmentButtonSelected,
                    ]}
                    onPress={() => setEditDepartment('Engineering')}
                  >
                    <Text style={styles.departmentButtonText}>Engineering</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleSaveProfile}
                >
                  <Text style={styles.modalButtonText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Delete Account Confirmation Modal */}
        <Modal
          visible={showDeleteAccountModal}
          transparent
          animationType="fade"
          onRequestClose={cancelDeleteAccount}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: undefined }]}>
              <Text style={styles.modalTitle}>{t('deleteAccount.title')}</Text>
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  {t('deleteAccount.warning')}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 24, textAlign: 'center', lineHeight: 24 }}>
                {t('deleteAccount.confirmation')}
                {'\n\n'}• {t('deleteAccount.itemVessels')}
                {'\n'}• {t('deleteAccount.itemEntries')}
                {'\n'}• {t('deleteAccount.itemReports')}
                {'\n'}• Your profile information
                {'\n\n'}This action is irreversible.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={cancelDeleteAccount}
                  disabled={deletingAccount}
                >
                  <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: colors.error }]}
                  onPress={confirmDeleteAccount}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.modalButtonText}>{t('common.delete')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </>
  );
}
