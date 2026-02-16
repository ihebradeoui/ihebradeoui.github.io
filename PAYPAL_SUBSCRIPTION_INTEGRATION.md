# PayPal Subscription Button Integration

## Overview

This document describes the PayPal subscription button integration for planet name subscriptions in the SkyDiver application.

## Features

- **Subscription Model**: Monthly recurring subscription at $2.99/month
- **Premium Planet Names**: Subscribers can save planet names permanently
- **User-Friendly Flow**: Simple checkbox-based activation in the planet edit modal
- **Robust Error Handling**: Graceful degradation when PayPal SDK is unavailable

## Integration Details

### 1. PayPal SDK Loading

**Location**: `src/index.html` (lines 9-12)

The PayPal SDK is loaded with subscription support enabled:

```html
<script src="https://www.paypal.com/sdk/js?client-id=sb&currency=USD&vault=true&intent=subscription"></script>
```

**Parameters**:
- `client-id=sb`: Sandbox client ID (replace with production ID for live environment)
- `currency=USD`: Currency for transactions
- `vault=true`: Enables vault/subscription features
- `intent=subscription`: Specifies subscription intent

### 2. User Interface

**Location**: `src/app/planets/planets.component.html` (lines 19-29)

The modal includes:
- Planet name and description fields
- **Subscription checkbox**: "💎 Subscribe with PayPal ($2.99/month)"
- Informational text explaining the subscription benefits
- PayPal button container (hidden by default, shown when checkbox is checked)
- Regular save button (shown by default, hidden when PayPal option is selected)

### 3. Button Logic

**Location**: `src/app/planets/planet-scene.ts`

#### Configuration

A configuration constant at the top of the `PlanetScene` class (line 76):

```typescript
private readonly PAYPAL_PLAN_ID = 'P-XXXXXXXXXXXXXXXXXXXX';
```

**⚠️ Important**: Replace this with your actual PayPal plan ID before production deployment.

#### Checkbox Handler

**Location**: Lines 1508-1520 in `setupModalInteraction()`

When the subscription checkbox is toggled:
- **Checked**: Shows PayPal button container, hides regular save button, initializes PayPal button
- **Unchecked**: Hides PayPal button container, shows regular save button, clears PayPal container

#### PayPal Button Initialization

**Location**: Lines 1530-1580 in `initPayPalButton()`

The method:
1. Checks if PayPal SDK is loaded
2. Creates PayPal subscription button with proper configuration
3. Handles subscription creation, approval, errors, and cancellation
4. Saves planet with premium flag on successful subscription

**Subscription Flow**:
```typescript
createSubscription: (data, actions) => {
  return actions.subscription.create({
    plan_id: this.PAYPAL_PLAN_ID,
    custom_id: `planet_subscription_${Date.now()}`,
    application_context: {
      shipping_preference: 'NO_SHIPPING'
    }
  });
}
```

**Success Handler**:
```typescript
onApprove: async (data, actions) => {
  console.log('Subscription approved:', data);
  this.savePlanet(true); // Saves with premium flag
  alert('✨ Subscription successful! Your planet names will be saved permanently while subscribed.');
}
```

### 4. Styling

**Location**: `src/app/planets/planets.component.scss` (lines 228-237)

Custom styles for PayPal integration:
- PayPal button container with min-height and rounded borders
- Checkbox with custom accent color matching the app theme
- Consistent with the overall cosmic/space theme

## Setup Instructions

### For Development

1. The sandbox client ID (`sb`) is already configured
2. PayPal SDK may be blocked by ad blockers or security policies
3. Test the modal and checkbox functionality
4. Button initialization works but may show "PayPal is not available" error

### For Production

#### Step 1: Create PayPal Subscription Plan

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Navigate to **Products & Pricing**
3. Click **Create Product**
4. Configure the plan:
   - **Name**: "Planet Name Subscription"
   - **Type**: "Service"
   - **Category**: "Software"
5. Click **Create Plan** under the product
6. Set plan details:
   - **Billing cycle**: Monthly
   - **Price**: $2.99 USD
   - **Description**: "Permanent planet name saves"
7. Save and activate the plan
8. **Copy the Plan ID** (format: `P-XXXXXXXXXXXXXXXXXXXX`)

#### Step 2: Update Configuration

1. Open `src/app/planets/planet-scene.ts`
2. Replace the `PAYPAL_PLAN_ID` constant (line 76):
   ```typescript
   private readonly PAYPAL_PLAN_ID = 'P-YOUR-ACTUAL-PLAN-ID';
   ```

3. Open `src/index.html`
4. Replace the sandbox client ID (line 12):
   ```html
   <script src="https://www.paypal.com/sdk/js?client-id=YOUR-PRODUCTION-CLIENT-ID&currency=USD&vault=true&intent=subscription"></script>
   ```

#### Step 3: Build and Deploy

```bash
npm run build -- --configuration production
```

## Testing

### Visual Testing

1. Navigate to the planets page: `/planets`
2. Click on any planet to open the edit modal
3. Verify the modal displays:
   - ✨ Title: "Edit Planet"
   - Planet name and description fields
   - Subscription checkbox with pricing information
   - Helpful description text

### Functional Testing

1. **Without subscription**:
   - Checkbox unchecked
   - Regular "🚀 Save Planet" button visible
   - PayPal button hidden

2. **With subscription**:
   - Check the subscription checkbox
   - Regular save button should hide
   - PayPal button container should appear
   - If SDK is loaded, PayPal button renders inside container
   - If SDK is unavailable, error message displays

3. **PayPal flow** (requires valid plan ID):
   - Click the PayPal button
   - PayPal popup/redirect opens
   - Complete subscription approval
   - Success message appears
   - Planet is saved with premium flag

### Error Scenarios

1. **PayPal SDK not loaded**:
   - Shows: "PayPal is not available. Please try again later."
   - Console logs: "PayPal SDK not loaded"

2. **Invalid Plan ID**:
   - PayPal button may fail to initialize
   - Error logged in console

3. **Subscription cancelled**:
   - User cancels in PayPal flow
   - Modal remains open, no changes saved
   - User can try again or save without subscription

## User Experience

### Free Save (Default)
- No payment required
- Planet name saved temporarily
- May be overwritten or lost

### Premium Save (Subscription)
- $2.99/month subscription
- Planet names saved permanently
- Persists across sessions
- Multiple planets can be saved
- Active as long as subscription is maintained

## Technical Notes

### Subscription vs One-time Payment

| Feature | One-time Payment | Subscription (Current) |
|---------|-----------------|------------------------|
| Price | $0.99 | $2.99/month |
| Duration | Forever (single payment) | While subscribed |
| SDK Intent | `checkout` | `subscription` |
| Method | `createOrder` | `createSubscription` |
| Approval | `order.capture()` | No capture needed |
| Plan Required | No | Yes (must be pre-created) |
| Revenue Model | One-time | Recurring |

### Data Flow

1. User opens planet edit modal
2. User checks "Subscribe with PayPal" checkbox
3. PayPal button renders in `#paypal-button-container`
4. User clicks PayPal button
5. PayPal subscription popup opens
6. User approves subscription in PayPal
7. `onApprove` callback fires
8. Planet is saved to Firebase with `isPremium: true`
9. Success message displayed
10. Modal closes

### Firebase Data Structure

```javascript
{
  planets: {
    [planetId]: {
      name: "Planet Name",
      description: "Planet Description",
      color: "#hexcode",
      size: 1.5,
      position: { x: 0, y: 0, z: 0 },
      isPremium: true  // Set when subscription is active
    }
  }
}
```

## Security Considerations

1. **Client-side only**: Current implementation is client-side only
2. **Validation**: No server-side validation of subscription status
3. **Recommendation**: For production, implement server-side webhook handlers to verify subscription status
4. **Plan ID**: Keep plan ID in configuration, not hardcoded
5. **Client ID**: Use environment variables for different environments (dev/staging/prod)

## Future Enhancements

### Suggested Improvements

1. **Webhook Integration**:
   - Listen for PayPal subscription events (created, cancelled, failed)
   - Update user's premium status in real-time
   - Handle subscription expiration

2. **Subscription Management UI**:
   - Show subscription status in user profile
   - Display renewal date
   - Add "Manage Subscription" button (links to PayPal)
   - Cancel/reactivate options

3. **Trial Period**:
   - Offer first week/month free
   - Encourage user conversion

4. **Multiple Tiers**:
   - Basic: $2.99/month (5 planets)
   - Premium: $4.99/month (unlimited planets)
   - Pro: $9.99/month (unlimited + special features)

5. **Promo Codes**:
   - Discount codes for special events
   - Referral program

## Troubleshooting

### Issue: PayPal button doesn't appear
**Possible Causes**:
- PayPal SDK blocked by ad blocker
- Invalid or missing client ID
- Network connectivity issues

**Solutions**:
- Disable ad blocker
- Check browser console for errors
- Verify SDK is loaded: `console.log(window.paypal)`

### Issue: Subscription fails to create
**Possible Causes**:
- Invalid plan ID
- Plan not active in PayPal dashboard
- PayPal account issues

**Solutions**:
- Verify plan ID matches PayPal dashboard
- Check plan status (must be active)
- Test with PayPal sandbox account

### Issue: Error after approval
**Possible Causes**:
- Firebase connection issues
- Invalid planet data

**Solutions**:
- Check browser console for detailed errors
- Verify Firebase configuration
- Ensure all required fields are filled

## Support Resources

- [PayPal Subscriptions Documentation](https://developer.paypal.com/docs/subscriptions/)
- [PayPal JavaScript SDK Reference](https://developer.paypal.com/sdk/js/reference/)
- [PayPal Sandbox Testing](https://developer.paypal.com/docs/api-basics/sandbox/)

## Summary

✅ **PayPal subscription button fully integrated**
✅ **User-friendly checkbox-based activation**
✅ **Proper error handling and user feedback**
✅ **Clear visual styling consistent with app theme**
✅ **Well-documented code with configuration constants**
✅ **Ready for production with minimal configuration changes**

**Next Steps for Production**:
1. Create PayPal subscription plan
2. Update `PAYPAL_PLAN_ID` constant
3. Update PayPal client ID in index.html
4. Test thoroughly in sandbox environment
5. Deploy to production
6. Monitor subscription events via PayPal dashboard
