#import "CObjCGuard.h"

NSString *_Nullable RSHTry(NS_NOESCAPE void (^block)(void)) {
    @try {
        block();
        return nil;
    } @catch (NSException *exception) {
        return [NSString stringWithFormat:@"%@: %@", exception.name, exception.reason ?: @"(no reason)"];
    } @catch (id other) {
        return [NSString stringWithFormat:@"%@", other];
    }
}
